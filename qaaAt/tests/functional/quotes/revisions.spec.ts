import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import { freezeTestTime } from '#tests/support/clock'
import { responseResource } from '#tests/support/responses'
import {
  createCatalog,
  createDraftQuote,
  createInquiry,
  createPricingScenario,
  sendQuote,
} from '#tests/support/scenarios/pricing'

type Revision = {
  id: number
  status: string
  subtotal_minor: string
  vat_minor: string
  total_minor: string
  deposit_minor: string
  remaining_minor: string
  line_items: Array<Record<string, unknown>>
}

test.group('Quote revision HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('server calculates totals and creates a new draft without mutating the sent revision', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createPricingScenario()
    const { rate, service } = await createCatalog(client, scenario.owner, scenario.space)
    const inquiryId = await createInquiry(
      client,
      scenario.customer,
      scenario.space,
      scenario.startsAt,
      scenario.endsAt,
      'quote-revision-totals'
    )
    const quote = await createDraftQuote(
      client,
      scenario.owner,
      scenario.company.id,
      inquiryId,
      rate.id as number,
      service.id as number
    )
    const initial = (quote.revisions as Revision[])[0]
    assert.deepInclude(initial, {
      subtotal_minor: '120000',
      vat_minor: '18000',
      total_minor: '138000',
      deposit_minor: '69000',
      remaining_minor: '69000',
    })
    await sendQuote(client, scenario.owner, scenario.company.id, quote.id as number)

    const updated = await client
      .visit('company_quotes.update', { id: quote.id as number })
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
      .json({
        pricesIncludeVat: false,
        vatRateBps: 1500,
        items: [
          { sourceType: 'rate_plan', sourceId: rate.id, quantity: 1, discountMinor: '10000' },
        ],
      })
    updated.assertStatus(200)
    const detail = await client
      .visit('company_quotes.show', { id: quote.id as number })
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
    const revisions = responseResource(detail.body()).revisions as Revision[]
    assert.lengthOf(revisions, 2)
    assert.equal(revisions.find(({ status }) => status === 'sent')?.total_minor, '138000')

    await sendQuote(client, scenario.owner, scenario.company.id, quote.id)
    const afterResend = await client
      .visit('company_quotes.show', { id: quote.id })
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
    const sentHistory = responseResource(afterResend.body()).revisions as Revision[]
    assert.equal(sentHistory.find(({ status }) => status === 'superseded')?.total_minor, '138000')
    assert.equal(sentHistory.find(({ status }) => status === 'sent')?.total_minor, '103500')
  })

  test('inclusive and exclusive VAT snapshots are exact and mixed catalog policies are rejected', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createPricingScenario()
    const { rate } = await createCatalog(client, scenario.owner, scenario.space)
    const inclusiveResponse = await client
      .visit('company_pricing.store_service')
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
      .json({
        nameAr: 'شامل',
        priceMinor: '11500',
        pricesIncludeVat: true,
        vatRateBps: 1500,
        isActive: true,
      })
    const inclusive = responseResource(inclusiveResponse.body()) as Record<string, unknown> & {
      id: number
    }
    await client
      .visit('company_pricing.attach_service', { spaceId: scenario.space.id })
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
      .json({ serviceOptionId: inclusive.id })
    const inquiryId = await createInquiry(
      client,
      scenario.customer,
      scenario.space,
      scenario.startsAt,
      scenario.endsAt,
      'quote-vat-policy'
    )
    const exclusive = await createDraftQuote(
      client,
      scenario.owner,
      scenario.company.id,
      inquiryId,
      rate.id as number
    )
    assert.deepInclude((exclusive.revisions as Revision[])[0].line_items[0], {
      prices_include_vat: false,
      vat_minor: '15000',
      total_minor: '115000',
    })
    const inclusiveQuote = await client
      .visit('company_quotes.store')
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
      .json({
        inquiryId,
        pricesIncludeVat: true,
        vatRateBps: 1500,
        items: [{ sourceType: 'service', sourceId: inclusive.id, quantity: 1 }],
      })
    inclusiveQuote.assertStatus(201)
    assert.deepInclude(
      (responseResource(inclusiveQuote.body()).revisions as Revision[])[0].line_items[0],
      { prices_include_vat: true, vat_minor: '1500', total_minor: '11500' }
    )
    const mixed = await client
      .visit('company_quotes.store')
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
      .json({
        inquiryId,
        pricesIncludeVat: false,
        vatRateBps: 1500,
        items: [
          { sourceType: 'rate_plan', sourceId: rate.id, quantity: 1 },
          { sourceType: 'service', sourceId: inclusive.id, quantity: 1 },
        ],
      })
    mixed.assertStatus(422)
    mixed.assertBodyContains({ error: { code: 'QUOTE_TAX_POLICY_MIXED' } })
  })

  test('sent monetary and tax snapshots survive catalog edits and archival', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createPricingScenario()
    const { rate } = await createCatalog(client, scenario.owner, scenario.space)
    const inquiryId = await createInquiry(
      client,
      scenario.customer,
      scenario.space,
      scenario.startsAt,
      scenario.endsAt,
      'quote-historical-snapshot'
    )
    const quote = await createDraftQuote(
      client,
      scenario.owner,
      scenario.company.id,
      inquiryId,
      rate.id as number
    )
    await sendQuote(client, scenario.owner, scenario.company.id, quote.id as number)
    await db.from('rate_plans').where('id', rate.id).update({
      price_minor: '1',
      vat_rate_bps: 0,
      prices_include_vat: true,
      is_active: false,
      archived_at: new Date(),
    })
    const provider = await client
      .visit('company_quotes.show', { id: quote.id as number })
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
    const customer = await client
      .visit('user_quotes.show', { id: quote.id as number })
      .withGuard('api')
      .loginAs(scenario.customer)
    for (const response of [provider, customer]) {
      const revision = (responseResource(response.body()).revisions as Revision[]).find(
        ({ status }) => status === 'sent'
      )!
      assert.equal(revision.total_minor, '115000')
      assert.deepInclude(revision.line_items[0], {
        prices_include_vat: false,
        vat_rate_bps: 1500,
      })
    }
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
