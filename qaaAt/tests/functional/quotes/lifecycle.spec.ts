import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import { createCustomer } from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { responseItems, responseResource } from '#tests/support/responses'
import {
  createCatalog,
  createDraftQuote,
  createInquiry,
  createPricingScenario,
  sendQuote,
} from '#tests/support/scenarios/pricing'

test.group('Quote lifecycle HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('draft and sent quotes do not reserve inventory; acceptance creates one booking hold and block', async ({
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
      'quote-acceptance'
    )
    const quote = await createDraftQuote(
      client,
      scenario.owner,
      scenario.company.id,
      inquiryId,
      rate.id as number
    )
    assert.lengthOf(await db.from('space_inventory_blocks'), 0)
    const sent = await sendQuote(client, scenario.owner, scenario.company.id, quote.id as number)
    assert.lengthOf(await db.from('space_inventory_blocks'), 0)

    const accepted = await client
      .visit('user_quotes.accept', { id: quote.id as number })
      .withGuard('api')
      .loginAs(scenario.customer)
      .json({ revisionId: sent.current_revision_id })
    accepted.assertStatus(200)
    const stored = await db.from('quotes').where('id', quote.id).firstOrFail()
    assert.equal(stored.status, 'accepted')
    assert.lengthOf(await db.from('bookings').where('id', stored.booking_id), 1)
    assert.lengthOf(
      await db.from('booking_holds').where({ booking_id: stored.booking_id, status: 'active' }),
      1
    )
    assert.lengthOf(
      await db
        .from('space_inventory_blocks')
        .where({ space_id: scenario.space.id, status: 'active' }),
      1
    )
  })

  test('suspended space rolls acceptance back and leaves the sent quote unchanged', async ({
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
      'quote-suspended-space'
    )
    const quote = await createDraftQuote(
      client,
      scenario.owner,
      scenario.company.id,
      inquiryId,
      rate.id as number
    )
    await sendQuote(client, scenario.owner, scenario.company.id, quote.id as number)
    await db
      .from('spaces')
      .where('id', scenario.space.id)
      .update({ publication_status: 'suspended' })
    const rejected = await client
      .visit('user_quotes.accept', { id: quote.id as number })
      .withGuard('api')
      .loginAs(scenario.customer)
      .json({})
    rejected.assertStatus(409)
    const unchangedQuote = await db.from('quotes').where('id', quote.id).firstOrFail()
    assert.equal(unchangedQuote.status, 'sent')
    assert.lengthOf(await db.from('bookings'), 0)
  })

  test('customer decline preserves quote history and notification intent', async ({
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
      'quote-decline'
    )
    const quote = await createDraftQuote(
      client,
      scenario.owner,
      scenario.company.id,
      inquiryId,
      rate.id as number
    )
    await sendQuote(client, scenario.owner, scenario.company.id, quote.id as number)
    const declined = await client
      .visit('user_quotes.decline', { id: quote.id as number })
      .withGuard('api')
      .loginAs(scenario.customer)
      .json({ reason: 'غير مناسب' })
    declined.assertStatus(200)
    const storedQuote = await db.from('quotes').where('id', quote.id).firstOrFail()
    assert.equal(storedQuote.status, 'customer_declined')
    assert.lengthOf(await db.from('quote_events').where('quote_id', quote.id), 3)
    const outbox = await db.from('notification_outbox')
    assert.isAbove(outbox.length, 0)
  })

  test('provider withdrawal is terminal, audited, and visible to the customer', async ({
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
      'quote-withdraw'
    )
    const quote = await createDraftQuote(
      client,
      scenario.owner,
      scenario.company.id,
      inquiryId,
      rate.id
    )
    await sendQuote(client, scenario.owner, scenario.company.id, quote.id)
    const withdrawn = await client
      .visit('company_quotes.withdraw', { id: quote.id })
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
      .json({ reason: 'لم يعد الموعد متاحاً' })
    withdrawn.assertStatus(200)
    withdrawn.assertBodyContains({ data: { status: 'withdrawn' } })
    const customer = await client
      .visit('user_quotes.show', { id: quote.id })
      .withGuard('api')
      .loginAs(scenario.customer)
    customer.assertStatus(200)
    customer.assertBodyContains({ data: { status: 'withdrawn' } })
    assert.lengthOf(
      await db.from('quote_events').where({ quote_id: quote.id, action: 'quote.withdrawn' }),
      1
    )
  })

  test('customer and provider quote reads enforce ownership, tenant scope, and redaction', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createPricingScenario()
    const outsider = await createCustomer()
    const { rate } = await createCatalog(client, scenario.owner, scenario.space)
    const inquiryId = await createInquiry(
      client,
      scenario.customer,
      scenario.space,
      scenario.startsAt,
      scenario.endsAt,
      'quote-private'
    )
    const created = await client
      .visit('company_quotes.store')
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
      .json({
        inquiryId,
        internalNotes: 'provider secret',
        pricesIncludeVat: false,
        vatRateBps: 1500,
        items: [{ sourceType: 'rate_plan', sourceId: rate.id, quantity: 1 }],
      })
    const quote = responseResource(created.body()) as Record<string, unknown> & { id: number }
    await sendQuote(client, scenario.owner, scenario.company.id, quote.id as number)
    const hidden = await client
      .visit('user_quotes.show', { id: quote.id as number })
      .withGuard('api')
      .loginAs(outsider)
    hidden.assertStatus(404)
    const own = await client
      .visit('user_quotes.show', { id: quote.id as number })
      .withGuard('api')
      .loginAs(scenario.customer)
    own.assertStatus(200)
    assert.notProperty(responseResource(own.body()), 'internal_notes')

    const list = await client.visit('user_quotes.index').withGuard('api').loginAs(scenario.customer)
    list.assertStatus(200)
    const listedQuote = responseItems(list.body())[0]
    assert.notProperty(listedQuote, 'internal_notes')
    assert.notProperty(listedQuote, 'created_by_membership_id')
    assert.notProperty(listedQuote, 'lock_version')
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
