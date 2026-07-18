import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import pricingQuotes from '#services/pricing_quote_service'
import CompanyMembershipPermission from '#models/company_membership_permission'
import { createCompanyMember, createCustomer } from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { withTruncateIsolation } from '#tests/support/database'
import {
  createPricingRecords,
  createPricingScenario,
  markQuoteExpired,
  sendPricingRecord,
} from '#tests/support/scenarios/pricing'

test.group('Quote workers and acceptance races', (group) => {
  group.each.setup(withTruncateIsolation)

  test('simultaneous acceptance has one winner and creates one commercial aggregate', async ({
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createPricingScenario()
    const { quote } = await createPricingRecords(scenario, 'quote-race')
    const sent = await sendPricingRecord(scenario, quote.id)
    const attempts = await Promise.allSettled([
      pricingQuotes.acceptQuote(scenario.customer.id, quote.id, sent.current_revision_id),
      pricingQuotes.acceptQuote(scenario.customer.id, quote.id, sent.current_revision_id),
    ])
    assert.lengthOf(
      attempts.filter(({ status }) => status === 'fulfilled'),
      1
    )
    assert.lengthOf(await db.from('bookings'), 1)
    assert.lengthOf(await db.from('booking_holds'), 1)
    assert.lengthOf(await db.from('space_inventory_blocks'), 1)
  })

  test('overlapping sent quotes coexist but only one can acquire inventory', async ({ assert }) => {
    freezeTestTime()
    const scenario = await createPricingScenario()
    const otherCustomer = await createCustomer()
    const firstRecord = await createPricingRecords(scenario, 'overlap-first')
    const first = firstRecord.quote
    const originalCustomer = scenario.customer
    scenario.customer = otherCustomer
    const secondRecord = await createPricingRecords(scenario, 'overlap-second')
    const second = secondRecord.quote
    scenario.customer = originalCustomer
    await sendPricingRecord(scenario, first.id)
    await sendPricingRecord(scenario, second.id)
    await pricingQuotes.acceptQuote(scenario.customer.id, first.id)
    const failure = await pricingQuotes
      .acceptQuote(otherCustomer.id, second.id)
      .then(() => null)
      .catch((error: unknown) => error as { code?: string })
    assert.equal(failure?.code, 'INVENTORY_OVERLAP')
    const remainingQuote = await db.from('quotes').where('id', second.id).firstOrFail()
    assert.equal(remainingQuote.status, 'sent')
    assert.lengthOf(await db.from('bookings'), 1)
  })

  test('concurrent expiry workers claim an expired quote exactly once', async ({ assert }) => {
    freezeTestTime()
    const scenario = await createPricingScenario()
    const { quote } = await createPricingRecords(scenario, 'expiry-race')
    await markQuoteExpired(quote.id)
    const counts = await Promise.all([pricingQuotes.expire(), pricingQuotes.expire()])
    assert.equal(
      counts.reduce((sum, count) => sum + count, 0),
      1
    )
    assert.lengthOf(
      await db.from('quote_events').where({ quote_id: quote.id, action: 'quote.expired' }),
      1
    )
  })

  test('acceptance notifications include only active members allowed to view quotes', async ({
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createPricingScenario()
    const allowed = await createCompanyMember(scenario.company, 'manager')
    const denied = await createCompanyMember(scenario.company, 'manager')
    const revoked = await createCompanyMember(scenario.company, 'manager')
    await CompanyMembershipPermission.create({
      companyMembershipId: denied.membership.id,
      permission: 'quotes.view',
      effect: 'deny',
    })
    revoked.membership.status = 'revoked'
    await revoked.membership.save()
    const { quote } = await createPricingRecords(scenario, 'quote-fanout')
    await sendPricingRecord(scenario, quote.id)
    await db.from('notification_outbox').delete()
    await pricingQuotes.acceptQuote(scenario.customer.id, quote.id)
    const outbox = await db.from('notification_outbox')
    const recipients = outbox
      .filter(({ payload }) => payload.type === 'quote_accepted')
      .map(({ payload }) => payload.userId)
    assert.sameMembers(recipients, [scenario.owner.id, allowed.user.id])
  })
})
