import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import { freezeTestTime } from '#tests/support/clock'
import { responseResource } from '#tests/support/responses'
import { createInquiry, createPricingScenario, sendQuote } from '#tests/support/scenarios/pricing'

test.group('Quote exact-money HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('amounts beyond JavaScript safe integers remain exact through totals and deposit split', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createPricingScenario()
    const inquiryId = await createInquiry(
      client,
      scenario.customer,
      scenario.space,
      scenario.startsAt,
      scenario.endsAt,
      'quote-bigint'
    )
    const created = await client
      .visit('company_quotes.store')
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
      .json({
        inquiryId,
        pricesIncludeVat: true,
        vatRateBps: 1500,
        depositPercent: 50,
        items: [
          {
            sourceType: 'adjustment',
            descriptionAr: 'قيمة كبيرة',
            quantity: 1,
            unitPriceMinor: '9007199254740993',
          },
        ],
      })
    created.assertStatus(201)
    const revision = (
      responseResource(created.body()).revisions as Array<Record<string, unknown>>
    )[0]
    assert.deepInclude(revision, {
      total_minor: '9007199254740993',
      deposit_minor: '4503599627370497',
      remaining_minor: '4503599627370496',
    })
  })

  test('aggregate and multiplication overflow return the stable domain error', async ({
    client,
  }) => {
    freezeTestTime()
    const scenario = await createPricingScenario()
    const inquiryId = await createInquiry(
      client,
      scenario.customer,
      scenario.space,
      scenario.startsAt,
      scenario.endsAt,
      'quote-overflow'
    )
    for (const items of [
      [
        {
          sourceType: 'adjustment' as const,
          descriptionAr: 'أ',
          quantity: 1,
          unitPriceMinor: '5000000000000000000',
        },
        {
          sourceType: 'adjustment' as const,
          descriptionAr: 'ب',
          quantity: 1,
          unitPriceMinor: '5000000000000000000',
        },
      ],
      [
        {
          sourceType: 'adjustment' as const,
          descriptionAr: 'ضرب',
          quantity: 2,
          unitPriceMinor: '5000000000000000000',
        },
      ],
    ]) {
      const rejected = await client
        .visit('company_quotes.store')
        .withGuard('api')
        .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
        .json({ inquiryId, pricesIncludeVat: true, vatRateBps: 1500, items })
      rejected.assertStatus(422)
      rejected.assertBodyContains({ error: { code: 'QUOTE_AMOUNT_INVALID' } })
    }
  })

  test('acceptance copies an unsafe-integer monetary snapshot into the booking exactly', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createPricingScenario()
    const inquiryId = await createInquiry(
      client,
      scenario.customer,
      scenario.space,
      scenario.startsAt,
      scenario.endsAt,
      'quote-booking-exact-money'
    )
    const created = await client
      .visit('company_quotes.store')
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
      .json({
        inquiryId,
        pricesIncludeVat: true,
        vatRateBps: 0,
        items: [
          {
            sourceType: 'adjustment',
            descriptionAr: 'قيمة دقيقة',
            quantity: 1,
            unitPriceMinor: '9007199254740993',
          },
        ],
      })
    const quote = responseResource(created.body()) as Record<string, unknown> & { id: number }
    await sendQuote(client, scenario.owner, scenario.company.id, quote.id)
    const accepted = await client
      .visit('user_quotes.accept', { id: quote.id })
      .withGuard('api')
      .loginAs(scenario.customer)
      .json({})
    accepted.assertStatus(200)
    const storedQuote = await db.from('quotes').where('id', quote.id).firstOrFail()
    const booking = await db.from('bookings').where('id', storedQuote.booking_id).firstOrFail()
    assert.equal(booking.accepted_total_minor, '9007199254740993')
    assert.equal(booking.total_price, '90071992547409.93')
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
