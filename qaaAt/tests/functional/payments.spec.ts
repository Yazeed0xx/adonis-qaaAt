/* eslint-disable @unicorn/no-await-expression-member */
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import { CompanyFactory } from '#database/factories/company_factory'
import CompanyMembership from '#models/company_membership'
import CompanyMembershipPermission from '#models/company_membership_permission'
import { HallService } from '#services/hall_service'
import paymentService from '#services/payment_service'
import bookingManagement from '#services/booking_management_service'
import fakeProvider from '#services/fake_payment_provider'
import paymentConfig from '#config/payment'
import { paymentProvider } from '#services/payment_provider_service'
import BackfillMigration from '#database/migrations/1770000000011_seed_catalogs_and_backfill_halls'
import PaymentsMigration from '#database/migrations/1770000000050_create_payments_and_refunds'

async function setup() {
  await new BackfillMigration(db.connection(), import.meta.url).up()
  const owner = await UserFactory.apply('company', 'verified').create()
  const company = await CompanyFactory.apply('approved')
    .merge({ userId: owner.id })
    .with('companyProfile')
    .create()
  const membership = await CompanyMembership.create({
    companyId: company.id,
    userId: owner.id,
    role: 'owner',
    status: 'active',
    joinedAt: company.createdAt,
  })
  const hall = await new HallService().createHall(company.id, {
    name: 'Payment Hall',
    capacity: 100,
    location: 'Riyadh',
    pricing: 1000,
    address: 'Road',
    city: 'Riyadh',
    amenities: {},
    images: [],
    services: [],
    isAvailable: true,
  })
  const space = await db.from('spaces').where('legacy_hall_id', hall.id).firstOrFail()
  await db.from('spaces').where('id', space.id).update({ publication_status: 'published' })
  const customer = await UserFactory.apply('user', 'verified').create()
  const start = DateTime.now()
    .plus({ days: 10 })
    .setZone('Asia/Riyadh')
    .startOf('day')
    .set({ hour: 10 })
  const booking = await db.transaction(async (trx) => {
    const [row] = await trx
      .table('bookings')
      .insert({
        user_id: customer.id,
        hall_id: hall.id,
        company_id: company.id,
        venue_id: space.venue_id,
        space_id: space.id,
        request_reference: `PAY-${crypto.randomUUID()}`,
        request_source: 'space_api',
        space_name_snapshot_en: 'Payment Hall',
        contact_preference: 'in_app',
        booking_date: start.toISODate(),
        start_time: '10:00',
        end_time: '12:00',
        starts_at: start.toUTC().toSQL(),
        ends_at: start.plus({ hours: 2 }).toUTC().toSQL(),
        original_start_local: start.toISO({ includeOffset: false }),
        original_end_local: start.plus({ hours: 2 }).toISO({ includeOffset: false }),
        original_timezone: 'Asia/Riyadh',
        submitted_at: new Date(),
        response_expires_at: DateTime.now().plus({ days: 2 }).toSQL(),
        status: 'accepted',
        total_price: '90071992547409.93',
        payment_status: 'unpaid',
        payment_due_date: DateTime.now().plus({ days: 2 }).toSQL(),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*')
    await trx.table('booking_holds').insert({
      company_id: company.id,
      space_id: space.id,
      booking_id: row.id,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      expires_at: DateTime.now().plus({ days: 2 }).toSQL(),
      created_at: new Date(),
    })
    const hold = await trx.from('booking_holds').where('booking_id', row.id).firstOrFail()
    await trx.table('space_inventory_blocks').insert({
      company_id: company.id,
      space_id: space.id,
      booking_hold_id: hold.id,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      blocked_from_at: row.starts_at,
      blocked_until_at: row.ends_at,
      created_at: new Date(),
    })
    return row
  })
  await paymentService.createPolicy(company.id, membership.id, {
    name: 'Standard',
    tiers: [{ minimumHours: 0, refundPercent: 50 }],
  })
  return { owner, company, membership, customer, booking }
}

function paymentEvent(attempt: any, payment: any, overrides: Record<string, unknown> = {}) {
  return {
    eventId: `evt_${crypto.randomUUID()}`,
    eventType: 'payment.succeeded',
    reference: attempt.provider_attempt_reference,
    amountMinor: payment.expectedAmountMinor,
    currency: 'SAR',
    status: 'succeeded',
    occurredAt: new Date().toISOString(),
    ...overrides,
  }
}

async function postRawWebhook(client: any, raw: string, signature: string) {
  return client
    .post('/api/payment-webhooks/fake')
    .header('x-qaaat-signature', signature)
    .unsafeJson(raw)
}

async function confirm(customer: any, booking: any, key: string) {
  const payment = await paymentService.initiate(customer.id, booking.id, key)
  const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
  const raw = Buffer.from(JSON.stringify(paymentEvent(attempt, payment)))
  await paymentService.processWebhook(raw, fakeProvider.sign(raw))
  return { payment, attempt }
}

function refundEvent(refund: any, overrides: Record<string, unknown> = {}) {
  return {
    eventId: `evt_${crypto.randomUUID()}`,
    eventType: 'refund.succeeded',
    reference: refund.provider_refund_reference,
    internalCorrelationReference: refund.reference,
    amountMinor: String(refund.approved_amount_minor),
    currency: 'SAR',
    status: 'succeeded',
    occurredAt: new Date().toISOString(),
    ...overrides,
  }
}

async function databaseError(operation: () => Promise<unknown>) {
  try {
    await operation()
  } catch (error) {
    return error as { code?: string }
  }
  return null
}

async function attachDepositQuote(ctx: Awaited<ReturnType<typeof setup>>) {
  const [quote] = await db
    .table('quotes')
    .insert({
      reference: `Q-${crypto.randomUUID()}`,
      company_id: ctx.company.id,
      venue_id: ctx.booking.venue_id,
      space_id: ctx.booking.space_id,
      user_id: ctx.customer.id,
      created_by_membership_id: ctx.membership.id,
      booking_id: ctx.booking.id,
      status: 'draft',
      starts_at: ctx.booking.starts_at,
      ends_at: ctx.booking.ends_at,
      start_local: ctx.booking.original_start_local,
      end_local: ctx.booking.original_end_local,
      timezone: ctx.booking.original_timezone,
      created_at: new Date(),
    })
    .returning('*')
  const [revision] = await db
    .table('quote_revisions')
    .insert({
      quote_id: quote.id,
      company_id: ctx.company.id,
      revision_number: 1,
      status: 'draft',
      subtotal_minor: '10000',
      vat_minor: '0',
      total_minor: '10000',
      deposit_percent: 25,
      deposit_minor: '2500',
      remaining_minor: '7500',
      created_by_membership_id: ctx.membership.id,
      created_at: new Date(),
    })
    .returning('*')
  await db
    .from('quote_revisions')
    .where('id', revision.id)
    .update({
      status: 'sent',
      sent_by_membership_id: ctx.membership.id,
      sent_at: new Date(),
      expires_at: DateTime.now().plus({ day: 1 }).toSQL(),
    })
  await db.from('quotes').where('id', quote.id).update({
    status: 'accepted',
    current_revision_id: revision.id,
    accepted_revision_id: revision.id,
    accepted_at: new Date(),
  })
  await db.from('bookings').where('id', ctx.booking.id).update({
    accepted_quote_id: quote.id,
    accepted_quote_revision_id: revision.id,
    accepted_total_minor: '10000',
    total_price: '100.00',
  })
}

test.group('Sprint 6 payments and refunds', (group) => {
  group.each.setup(() => testUtils.db().truncate())
  test('initiates from authoritative amount and is idempotent', async ({ assert }) => {
    const { customer, booking } = await setup()
    const first = await paymentService.initiate(customer.id, booking.id, 'payment-key-0001')
    const second = await paymentService.initiate(customer.id, booking.id, 'payment-key-0001')
    assert.equal(first.reference, second.reference)
    assert.equal(first.expectedAmountMinor, '9007199254740993')
    assert.equal(first.status, 'pending')
    assert.lengthOf(await db.from('payments'), 1)
    assert.lengthOf(await db.from('payment_attempts'), 1)
  })
  test('verified success confirms booking and promotes one inventory block', async ({ assert }) => {
    const { customer, booking } = await setup()
    const payment = await paymentService.initiate(customer.id, booking.id, 'payment-key-0002')
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    const raw = Buffer.from(
      JSON.stringify({
        eventId: 'evt-success-1',
        eventType: 'payment.succeeded',
        reference: attempt.provider_attempt_reference,
        amountMinor: payment.expectedAmountMinor,
        currency: 'SAR',
        status: 'succeeded',
        occurredAt: new Date().toISOString(),
      })
    )
    await paymentService.processWebhook(raw, fakeProvider.sign(raw))
    const finalBooking = await db.from('bookings').where('id', booking.id).firstOrFail()
    assert.equal(finalBooking.status, 'confirmed')
    assert.equal(finalBooking.payment_status, 'paid')
    const blocks = await db.from('space_inventory_blocks').where('status', 'active')
    assert.lengthOf(blocks, 1)
    assert.equal(blocks[0].booking_id, booking.id)
    assert.isNull(blocks[0].booking_hold_id)
  })
  test('invalid signature and wrong amount never confirm', async ({ assert }) => {
    const { customer, booking } = await setup()
    const payment = await paymentService.initiate(customer.id, booking.id, 'payment-key-0003')
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    const raw = Buffer.from(
      JSON.stringify({
        eventId: 'evt-wrong-1',
        eventType: 'payment.succeeded',
        reference: attempt.provider_attempt_reference,
        amountMinor: '1',
        currency: 'SAR',
        status: 'succeeded',
        occurredAt: new Date().toISOString(),
      })
    )
    await assert.rejects(() => paymentService.processWebhook(raw, 'invalid'))
    await paymentService.processWebhook(raw, fakeProvider.sign(raw))
    const wrongCurrency = Buffer.from(
      JSON.stringify({
        ...paymentEvent(attempt, payment),
        eventId: 'evt-wrong-currency-1',
        currency: 'USD',
      })
    )
    await paymentService.processWebhook(wrongCurrency, fakeProvider.sign(wrongCurrency))
    const currentBooking = await db.from('bookings').where('id', booking.id).firstOrFail()
    const mismatch = await db.from('reconciliation_records').firstOrFail()
    assert.equal(currentBooking.status, 'accepted')
    assert.equal(mismatch.result, 'amount_mismatch')
    assert.lengthOf(await db.from('reconciliation_records').where('result', 'currency_mismatch'), 1)
  })
  test('duplicate trusted events are idempotent', async ({ assert }) => {
    const { customer, booking } = await setup()
    const payment = await paymentService.initiate(customer.id, booking.id, 'payment-key-0004')
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    const raw = Buffer.from(
      JSON.stringify({
        eventId: 'evt-duplicate-1',
        eventType: 'payment.succeeded',
        reference: attempt.provider_attempt_reference,
        amountMinor: payment.expectedAmountMinor,
        currency: 'SAR',
        status: 'succeeded',
        occurredAt: new Date().toISOString(),
      })
    )
    const signature = fakeProvider.sign(raw)
    await paymentService.processWebhook(raw, signature)
    const duplicate = await paymentService.processWebhook(raw, signature)
    assert.equal(duplicate.outcome, 'duplicate')
    assert.lengthOf(await db.from('booking_invoice_snapshots'), 1)
  })

  test('real HTTP stack verifies exact raw bytes and confirms only through webhook', async ({
    client,
    assert,
  }) => {
    const { customer, booking } = await setup()
    const payment = await paymentService.initiate(customer.id, booking.id, 'payment-http-0001')
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    const raw = JSON.stringify(paymentEvent(attempt, payment))
    const signed = await postRawWebhook(client, raw, fakeProvider.sign(Buffer.from(raw)))
    signed.assertStatus(200)
    assert.equal(
      (await db.from('bookings').where('id', booking.id).firstOrFail()).status,
      'confirmed'
    )
  })

  test('one-byte changes, invalid signatures, and oversized HTTP bodies fail safely', async ({
    client,
    assert,
  }) => {
    const { customer, booking } = await setup()
    const payment = await paymentService.initiate(customer.id, booking.id, 'payment-http-0002')
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    const raw = JSON.stringify(paymentEvent(attempt, payment))
    const changed = `${raw} `
    ;(await postRawWebhook(client, changed, fakeProvider.sign(Buffer.from(raw)))).assertStatus(401)
    ;(await postRawWebhook(client, raw, '0'.repeat(64))).assertStatus(401)
    const oversized = JSON.stringify({ padding: 'x'.repeat(70_000) })
    const tooLarge = await postRawWebhook(
      client,
      oversized,
      fakeProvider.sign(Buffer.from(oversized))
    )
    tooLarge.assertStatus(413)
    assert.equal(tooLarge.body().error.code, 'PAYMENT_EVENT_TOO_LARGE')
    assert.lengthOf(await db.from('payment_webhook_events'), 0)
    assert.equal(
      (await db.from('bookings').where('id', booking.id).firstOrFail()).status,
      'accepted'
    )
  })

  test('signed malformed or contradictory events are rejected without mutation', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    const payment = await paymentService.initiate(customer.id, booking.id, 'payment-event-0001')
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    for (const overrides of [
      { amountMinor: '-1' },
      { eventType: 'payment.succeeded', status: 'failed' },
      { eventType: 'payment.unknown' },
      { occurredAt: 'not-a-time' },
    ]) {
      const raw = Buffer.from(JSON.stringify(paymentEvent(attempt, payment, overrides)))
      await assert.rejects(() => paymentService.processWebhook(raw, fakeProvider.sign(raw)))
    }
    assert.equal(
      (await db.from('bookings').where('id', booking.id).firstOrFail()).status,
      'accepted'
    )
    assert.lengthOf(await db.from('payment_webhook_events').where('outcome', 'rejected'), 4)
  })

  test('late success remains reconciliation_required and never promotes inventory', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    const payment = await paymentService.initiate(customer.id, booking.id, 'payment-late-0001')
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    await db
      .from('booking_holds')
      .where('booking_id', booking.id)
      .update({ expires_at: DateTime.now().minus({ minute: 1 }).toSQL() })
    const raw = Buffer.from(JSON.stringify(paymentEvent(attempt, payment)))
    const result = await paymentService.processWebhook(raw, fakeProvider.sign(raw))
    assert.equal(result.outcome, 'reconciliation_required')
    assert.equal(
      (await db.from('bookings').where('id', booking.id).firstOrFail()).status,
      'accepted'
    )
    assert.equal(
      (await db.from('payments').where('id', payment.id).firstOrFail()).status,
      'pending'
    )
    assert.equal((await db.from('reconciliation_records').firstOrFail()).result, 'late_success')
    assert.equal(
      (await db.from('payment_webhook_events').firstOrFail()).outcome,
      'reconciliation_required'
    )
    assert.lengthOf(await db.from('space_inventory_blocks').whereNotNull('booking_id'), 0)
  })

  test('payment success versus hold expiry has one consistent winner', async ({ assert }) => {
    const { customer, booking } = await setup()
    const payment = await paymentService.initiate(customer.id, booking.id, 'payment-expiry-race')
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    await db.from('booking_holds').where('booking_id', booking.id).update({
      expires_at: DateTime.now().toSQL(),
    })
    const raw = Buffer.from(JSON.stringify(paymentEvent(attempt, payment)))
    await Promise.all([
      paymentService.processWebhook(raw, fakeProvider.sign(raw)),
      bookingManagement.expirePaymentHolds(),
    ])
    await bookingManagement.expirePaymentHolds()
    const finalBooking = await db.from('bookings').where('id', booking.id).firstOrFail()
    const finalPayment = await db.from('payments').where('id', payment.id).firstOrFail()
    assert.include(['confirmed', 'payment_expired'], finalBooking.status)
    assert.equal(finalBooking.status === 'confirmed', finalPayment.status === 'paid')
    assert.isAtMost((await db.from('space_inventory_blocks').where('status', 'active')).length, 1)
  })

  test('payment success versus customer cancellation has one consistent winner', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    const payment = await paymentService.initiate(customer.id, booking.id, 'payment-cancel-race')
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    const raw = Buffer.from(JSON.stringify(paymentEvent(attempt, payment)))
    const results = await Promise.allSettled([
      paymentService.processWebhook(raw, fakeProvider.sign(raw)),
      bookingManagement.cancelBooking(booking.id, customer.id),
    ])
    const finalBooking = await db.from('bookings').where('id', booking.id).firstOrFail()
    const finalPayment = await db.from('payments').where('id', payment.id).firstOrFail()
    assert.include(['confirmed', 'cancelled'], finalBooking.status)
    assert.equal(finalBooking.status === 'confirmed', finalPayment.status === 'paid')
    assert.equal(results.filter((result) => result.status === 'fulfilled').length >= 1, true)
    assert.isAtMost((await db.from('space_inventory_blocks').where('status', 'active')).length, 1)
    assert.notEqual((await db.from('payment_webhook_events').firstOrFail()).outcome, 'received')
  })

  test('webhook transaction rollback leaves payment booking hold and inventory unchanged', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    const payment = await paymentService.initiate(customer.id, booking.id, 'payment-rollback-01')
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    await db.table('booking_invoice_snapshots').insert({
      payment_id: payment.id,
      booking_id: booking.id,
      snapshot: { fixture: true },
      created_at: new Date(),
    })
    const raw = Buffer.from(JSON.stringify(paymentEvent(attempt, payment)))
    await assert.rejects(() => paymentService.processWebhook(raw, fakeProvider.sign(raw)))
    assert.equal(
      (await db.from('bookings').where('id', booking.id).firstOrFail()).status,
      'accepted'
    )
    assert.equal(
      (await db.from('payments').where('id', payment.id).firstOrFail()).status,
      'pending'
    )
    assert.equal(
      (await db.from('booking_holds').where('booking_id', booking.id).firstOrFail()).status,
      'active'
    )
    assert.isNotNull(
      (await db.from('space_inventory_blocks').where('status', 'active').firstOrFail())
        .booking_hold_id
    )
  })

  test('payment failure may be followed by success and success never regresses', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    const payment = await paymentService.initiate(customer.id, booking.id, 'payment-ordering-01')
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    const failed = Buffer.from(
      JSON.stringify(
        paymentEvent(attempt, payment, {
          eventType: 'payment.failed',
          status: 'failed',
          eventId: `evt_${crypto.randomUUID()}`,
        })
      )
    )
    await paymentService.processWebhook(failed, fakeProvider.sign(failed))
    assert.equal(
      (await db.from('payment_attempts').where('id', attempt.id).firstOrFail()).status,
      'failed'
    )
    const succeeded = Buffer.from(JSON.stringify(paymentEvent(attempt, payment)))
    await paymentService.processWebhook(succeeded, fakeProvider.sign(succeeded))
    assert.equal(
      (await db.from('bookings').where('id', booking.id).firstOrFail()).status,
      'confirmed'
    )
    const lateFailure = Buffer.from(
      JSON.stringify(
        paymentEvent(attempt, payment, {
          eventType: 'payment.failed',
          status: 'failed',
          eventId: `evt_${crypto.randomUUID()}`,
        })
      )
    )
    assert.equal(
      (await paymentService.processWebhook(lateFailure, fakeProvider.sign(lateFailure))).outcome,
      'ignored'
    )
    assert.equal(
      (await db.from('payment_attempts').where('id', attempt.id).firstOrFail()).status,
      'succeeded'
    )
  })

  test('concurrent payment failure and success always terminate both webhook events', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    const payment = await paymentService.initiate(customer.id, booking.id, 'payment-outcome-race')
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    const failure = Buffer.from(
      JSON.stringify(
        paymentEvent(attempt, payment, {
          eventId: `evt_${crypto.randomUUID()}`,
          eventType: 'payment.failed',
          status: 'failed',
        })
      )
    )
    const success = Buffer.from(JSON.stringify(paymentEvent(attempt, payment)))
    await Promise.all([
      paymentService.processWebhook(failure, fakeProvider.sign(failure)),
      paymentService.processWebhook(success, fakeProvider.sign(success)),
    ])
    assert.equal(
      (await db.from('bookings').where('id', booking.id).firstOrFail()).status,
      'confirmed'
    )
    assert.equal(
      (await db.from('payment_attempts').where('id', attempt.id).firstOrFail()).status,
      'succeeded'
    )
    assert.lengthOf(await db.from('payment_webhook_events').where('outcome', 'received'), 0)
  })

  test('verified event arriving before provider reference registration is replayed once', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    const original = fakeProvider.createPaymentAttempt.bind(fakeProvider)
    let earlyEventId = ''
    fakeProvider.createPaymentAttempt = async (input) => {
      earlyEventId = `evt_${crypto.randomUUID()}`
      const raw = Buffer.from(
        JSON.stringify({
          eventId: earlyEventId,
          eventType: 'payment.succeeded',
          reference: `fake_pay_${input.internalAttemptReference}`,
          internalCorrelationReference: input.internalAttemptReference,
          amountMinor: input.amountMinor,
          currency: 'SAR',
          status: 'succeeded',
          occurredAt: new Date().toISOString(),
        })
      )
      await paymentService.processWebhook(raw, fakeProvider.sign(raw))
      return original(input)
    }
    try {
      await paymentService.initiate(customer.id, booking.id, 'payment-race-0001')
    } finally {
      fakeProvider.createPaymentAttempt = original
    }
    assert.equal(
      (await db.from('bookings').where('id', booking.id).firstOrFail()).status,
      'confirmed'
    )
    const event = await db
      .from('payment_webhook_events')
      .where('provider_event_id', earlyEventId)
      .firstOrFail()
    assert.equal(event.outcome, 'processed')
    assert.lengthOf(await db.from('booking_invoice_snapshots'), 1)
  })

  test('background replay recovers a crash after references commit and claims exactly once', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    const originalCreate = fakeProvider.createPaymentAttempt.bind(fakeProvider)
    const originalInlineReplay = (paymentService as any).replayPendingWebhookEvents.bind(
      paymentService
    )
    let eventId = ''
    fakeProvider.createPaymentAttempt = async (input) => {
      eventId = `evt_${crypto.randomUUID()}`
      const raw = Buffer.from(
        JSON.stringify({
          eventId,
          eventType: 'payment.succeeded',
          reference: `unregistered_${crypto.randomUUID()}`,
          internalCorrelationReference: input.internalAttemptReference,
          amountMinor: input.amountMinor,
          currency: 'SAR',
          status: 'succeeded',
          occurredAt: new Date().toISOString(),
        })
      )
      await paymentService.processWebhook(raw, fakeProvider.sign(raw))
      return originalCreate(input)
    }
    ;(paymentService as any).replayPendingWebhookEvents = async () => {}
    try {
      await paymentService.initiate(customer.id, booking.id, 'payment-crash-replay-1')
    } finally {
      fakeProvider.createPaymentAttempt = originalCreate
      ;(paymentService as any).replayPendingWebhookEvents = originalInlineReplay
    }
    assert.equal(
      (await db.from('payment_webhook_events').where('provider_event_id', eventId).firstOrFail())
        .outcome,
      'received'
    )
    const workers = await Promise.all([
      paymentService.replayReceivedWebhookEvents(1),
      paymentService.replayReceivedWebhookEvents(1),
    ])
    assert.equal(
      workers.reduce((sum, value) => sum + value, 0),
      1
    )
    assert.equal(
      (await db.from('payment_webhook_events').where('provider_event_id', eventId).firstOrFail())
        .outcome,
      'processed'
    )
    assert.equal(
      (await db.from('bookings').where('id', booking.id).firstOrFail()).status,
      'confirmed'
    )
    assert.lengthOf(await db.from('booking_invoice_snapshots'), 1)
  })

  test('received events match later provider references or reconcile after bounded retries', async ({
    assert,
  }) => {
    const first = await setup()
    const payment = await paymentService.initiate(
      first.customer.id,
      first.booking.id,
      'payment-later-reference-1'
    )
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    const laterReference = `later_${crypto.randomUUID()}`
    const event = Buffer.from(
      JSON.stringify(paymentEvent(attempt, payment, { reference: laterReference }))
    )
    const received = await paymentService.processWebhook(event, fakeProvider.sign(event))
    assert.equal(received.outcome, 'received')
    await db
      .from('payment_attempts')
      .where('id', attempt.id)
      .update({ provider_attempt_reference: laterReference })
    await paymentService.replayReceivedWebhookEvents(1)
    assert.equal(
      (await db.from('bookings').where('id', first.booking.id).firstOrFail()).status,
      'confirmed'
    )

    const unknown = Buffer.from(
      JSON.stringify({
        ...paymentEvent(attempt, payment),
        eventId: `evt_${crypto.randomUUID()}`,
        reference: `unknown_${crypto.randomUUID()}`,
      })
    )
    await paymentService.processWebhook(unknown, fakeProvider.sign(unknown))
    await db
      .from('payment_webhook_events')
      .where('outcome', 'received')
      .update({ processing_attempts: 4 })
    await paymentService.replayReceivedWebhookEvents(1)
    const terminal = await db
      .from('payment_webhook_events')
      .where('provider_object_reference', 'like', 'unknown_%')
      .firstOrFail()
    assert.equal(terminal.outcome, 'reconciliation_required')
    assert.equal(terminal.processing_attempts, 5)
    assert.equal(
      (await db.from('reconciliation_records').orderBy('id', 'desc').firstOrFail()).result,
      'unknown_provider_reference'
    )
  })

  test('provider call observes committed intent and fake provider fails closed', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    const original = fakeProvider.createPaymentAttempt.bind(fakeProvider)
    let committed = false
    fakeProvider.createPaymentAttempt = async (input) => {
      committed = Boolean(
        await db.from('payment_attempts').where('reference', input.internalAttemptReference).first()
      )
      return original(input)
    }
    try {
      await paymentService.initiate(customer.id, booking.id, 'payment-boundary-1')
    } finally {
      fakeProvider.createPaymentAttempt = original
    }
    assert.isTrue(committed)
    const prior = paymentConfig.isFakeAllowed
    paymentConfig.isFakeAllowed = false
    try {
      assert.throws(() => paymentProvider(), /unavailable/i)
    } finally {
      paymentConfig.isFakeAllowed = prior
    }
  })

  test('concurrent initiation creates one attempt and blocks another active key', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    const [first, second] = await Promise.all([
      paymentService.initiate(customer.id, booking.id, 'payment-concurrent-1'),
      paymentService.initiate(customer.id, booking.id, 'payment-concurrent-1'),
    ])
    assert.equal(first.reference, second.reference)
    assert.lengthOf(await db.from('payments'), 1)
    assert.lengthOf(await db.from('payment_attempts'), 1)
    await assert.rejects(
      () => paymentService.initiate(customer.id, booking.id, 'payment-concurrent-2'),
      /active/i
    )
  })

  test('payment idempotency key reused for another Booking conflicts', async ({ assert }) => {
    const first = await setup()
    await paymentService.initiate(first.customer.id, first.booking.id, 'payment-conflict-key')
    const second = await setup()
    await db.from('bookings').where('id', second.booking.id).update({ user_id: first.customer.id })
    await assert.rejects(
      () => paymentService.initiate(first.customer.id, second.booking.id, 'payment-conflict-key'),
      /payload differs/i
    )
  })

  test('provider timeout preserves an unknown attempt and active inventory', async ({ assert }) => {
    const { customer, booking } = await setup()
    const original = fakeProvider.createPaymentAttempt.bind(fakeProvider)
    fakeProvider.createPaymentAttempt = async () => {
      throw new Error('timeout')
    }
    try {
      const payment = await paymentService.initiate(customer.id, booking.id, 'payment-timeout-01')
      assert.isNotNull(payment.attempt)
      assert.equal(payment.attempt!.status, 'unknown')
    } finally {
      fakeProvider.createPaymentAttempt = original
    }
    assert.lengthOf(await db.from('booking_holds').where('status', 'active'), 1)
    assert.lengthOf(await db.from('space_inventory_blocks').where('status', 'active'), 1)
  })

  test('deposit success confirms with an exact remaining balance', async ({ assert }) => {
    const ctx = await setup()
    await attachDepositQuote(ctx)
    const { payment } = await confirm(ctx.customer, ctx.booking, 'payment-deposit-01')
    const stored = await db.from('payments').where('id', payment.id).firstOrFail()
    const booking = await db.from('bookings').where('id', ctx.booking.id).firstOrFail()
    assert.equal(stored.purpose, 'deposit')
    assert.equal(String(stored.amount_paid_minor), '2500')
    assert.equal(String(stored.remaining_balance_minor), '7500')
    assert.equal(booking.status, 'confirmed')
    assert.equal(booking.payment_status, 'deposit_paid')
  })

  test('early refund webhook uses internal correlation and inline replay exactly once', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    await confirm(customer, booking, 'payment-refund-early-inline')
    const original = fakeProvider.requestRefund.bind(fakeProvider)
    let earlyEventId = ''
    fakeProvider.requestRefund = async (input) => {
      const providerReference = `fake_ref_${crypto.randomUUID()}`
      earlyEventId = `evt_${crypto.randomUUID()}`
      const raw = Buffer.from(
        JSON.stringify({
          eventId: earlyEventId,
          eventType: 'refund.succeeded',
          reference: providerReference,
          internalCorrelationReference: input.internalRefundReference,
          amountMinor: input.amountMinor,
          currency: 'SAR',
          status: 'succeeded',
          occurredAt: new Date().toISOString(),
        })
      )
      const received = await paymentService.processWebhook(raw, fakeProvider.sign(raw))
      assert.equal(received.outcome, 'received')
      assert.lengthOf(await db.from('reconciliation_records'), 0)
      return { providerRefundReference: providerReference, status: 'pending' }
    }
    try {
      await paymentService.cancelPaidBooking(
        'customer',
        customer.id,
        booking.id,
        'Early refund',
        'cancel-refund-early-inline'
      )
    } finally {
      fakeProvider.requestRefund = original
    }
    const refund = await db.from('refunds').firstOrFail()
    const attempt = await db.from('refund_attempts').firstOrFail()
    assert.equal(refund.status, 'succeeded')
    assert.equal(attempt.status, 'succeeded')
    assert.equal(
      (
        await db
          .from('payment_webhook_events')
          .where('provider_event_id', earlyEventId)
          .firstOrFail()
      ).outcome,
      'processed'
    )
    assert.lengthOf(await db.from('payment_events').where('action', 'refund.succeeded'), 1)
  })

  test('background workers recover an early refund webhook after inline replay crash', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    await confirm(customer, booking, 'payment-refund-early-background')
    const originalRequest = fakeProvider.requestRefund.bind(fakeProvider)
    const originalReplay = (paymentService as any).replayPendingRefundWebhookEvents.bind(
      paymentService
    )
    let eventId = ''
    fakeProvider.requestRefund = async (input) => {
      const providerReference = `fake_ref_${crypto.randomUUID()}`
      eventId = `evt_${crypto.randomUUID()}`
      const raw = Buffer.from(
        JSON.stringify({
          eventId,
          eventType: 'refund.succeeded',
          reference: providerReference,
          internalCorrelationReference: input.internalRefundReference,
          amountMinor: input.amountMinor,
          currency: 'SAR',
          status: 'succeeded',
          occurredAt: new Date().toISOString(),
        })
      )
      await paymentService.processWebhook(raw, fakeProvider.sign(raw))
      return { providerRefundReference: providerReference, status: 'pending' }
    }
    ;(paymentService as any).replayPendingRefundWebhookEvents = async () => {}
    try {
      await paymentService.cancelPaidBooking(
        'customer',
        customer.id,
        booking.id,
        'Crash recovery',
        'cancel-refund-early-background'
      )
    } finally {
      fakeProvider.requestRefund = originalRequest
      ;(paymentService as any).replayPendingRefundWebhookEvents = originalReplay
    }
    assert.equal((await db.from('refunds').firstOrFail()).status, 'provider_pending')
    const claims = await Promise.all([
      paymentService.replayReceivedWebhookEvents(1),
      paymentService.replayReceivedWebhookEvents(1),
    ])
    assert.equal(
      claims.reduce((sum, value) => sum + value, 0),
      1
    )
    assert.equal((await db.from('refunds').firstOrFail()).status, 'succeeded')
    assert.equal(
      (await db.from('payment_webhook_events').where('provider_event_id', eventId).firstOrFail())
        .outcome,
      'processed'
    )
  })

  test('permanently unknown refund event reconciles only after the replay threshold', async ({
    assert,
  }) => {
    const raw = Buffer.from(
      JSON.stringify({
        eventId: `evt_${crypto.randomUUID()}`,
        eventType: 'refund.succeeded',
        reference: `unknown_ref_${crypto.randomUUID()}`,
        amountMinor: '1',
        currency: 'SAR',
        status: 'succeeded',
        occurredAt: new Date().toISOString(),
      })
    )
    assert.equal(
      (await paymentService.processWebhook(raw, fakeProvider.sign(raw))).outcome,
      'received'
    )
    await db.from('payment_webhook_events').update({ processing_attempts: 4 })
    await paymentService.replayReceivedWebhookEvents(1)
    assert.equal(
      (await db.from('payment_webhook_events').firstOrFail()).outcome,
      'reconciliation_required'
    )
    assert.equal(
      (await db.from('reconciliation_records').firstOrFail()).result,
      'unknown_provider_reference'
    )
  })

  test('failed refund initiation is durable and an authorized idempotent retry can complete it', async ({
    client,
    assert,
  }) => {
    const { owner, customer, booking, company } = await setup()
    await confirm(customer, booking, 'payment-refund-retry')
    const original = fakeProvider.requestRefund.bind(fakeProvider)
    fakeProvider.requestRefund = async () => {
      throw new Error('provider unavailable')
    }
    try {
      await paymentService.cancelPaidBooking(
        'customer',
        customer.id,
        booking.id,
        'Retry required',
        'cancel-refund-retry'
      )
    } finally {
      fakeProvider.requestRefund = original
    }
    const refund = await db.from('refunds').firstOrFail()
    assert.equal(refund.status, 'failed')
    assert.equal((await db.from('refund_attempts').firstOrFail()).status, 'failed')
    const abilities = ['client:company_app', `company:${company.id}`]
    const retry = await client
      .post(`/api/companies/refunds/${refund.id}/retry`)
      .json({ idempotencyKey: 'refund-retry-company-1' })
      .withGuard('api')
      .loginAs(owner, abilities)
    retry.assertStatus(200)
    const retryAgain = await client
      .post(`/api/companies/refunds/${refund.id}/retry`)
      .json({ idempotencyKey: 'refund-retry-company-1' })
      .withGuard('api')
      .loginAs(owner, abilities)
    retryAgain.assertStatus(200)
    assert.lengthOf(await db.from('refund_attempts'), 2)
    const currentAttempt = await db.from('refund_attempts').orderBy('id', 'desc').firstOrFail()
    assert.equal(currentAttempt.status, 'provider_pending')
    assert.isString(currentAttempt.provider_refund_reference)
    const event = Buffer.from(
      JSON.stringify(refundEvent(refund, { reference: currentAttempt.provider_refund_reference }))
    )
    await paymentService.processWebhook(event, fakeProvider.sign(event))
    assert.equal(
      (await db.from('refunds').where('id', refund.id).firstOrFail()).status,
      'succeeded'
    )
    const finalized = await client
      .post(`/api/companies/refunds/${refund.id}/retry`)
      .json({ idempotencyKey: 'refund-retry-finalized' })
      .withGuard('api')
      .loginAs(owner, abilities)
    finalized.assertStatus(409)
    const customerRead = await client
      .get(`/api/users/refunds/${refund.id}`)
      .withGuard('api')
      .loginAs(customer, ['client:customer_app'])
    customerRead.assertStatus(200)
    assert.equal(customerRead.body().data.status, 'succeeded')
    assert.lengthOf(customerRead.body().data.attempts, 2)
  })

  test('concurrent refund retry creates one attempt and one provider call', async ({ assert }) => {
    const { customer, booking, company } = await setup()
    await confirm(customer, booking, 'payment-refund-concurrent-retry')
    const original = fakeProvider.requestRefund.bind(fakeProvider)
    fakeProvider.requestRefund = async () => {
      throw new Error('initial failure')
    }
    await paymentService.cancelPaidBooking(
      'customer',
      customer.id,
      booking.id,
      'Concurrent retry',
      'cancel-refund-concurrent-retry'
    )
    const refund = await db.from('refunds').firstOrFail()
    let calls = 0
    fakeProvider.requestRefund = async (input) => {
      calls++
      await new Promise((resolve) => setTimeout(resolve, 25))
      return {
        providerRefundReference: `fake_ref_${input.internalRefundReference}`,
        status: 'pending',
      }
    }
    try {
      const [first, second] = await Promise.all([
        paymentService.retryRefund(company.id, refund.id, 'refund-concurrent-key'),
        paymentService.retryRefund(company.id, refund.id, 'refund-concurrent-key'),
      ])
      assert.equal(first.attempts[0].reference, second.attempts[0].reference)
    } finally {
      fakeProvider.requestRefund = original
    }
    assert.equal(calls, 1)
    assert.lengthOf(await db.from('refund_attempts'), 2)
    const changedAmount = (BigInt(refund.approved_amount_minor) - 1n).toString()
    await db.from('refunds').where('id', refund.id).update({
      requested_amount_minor: changedAmount,
      approved_amount_minor: changedAmount,
    })
    const conflict = await paymentService
      .retryRefund(company.id, refund.id, 'refund-concurrent-key')
      .then(() => null)
      .catch((error) => error)
    assert.equal(conflict?.code, 'PAYMENT_IDEMPOTENCY_CONFLICT')
  })

  test('refund retry requires effective refunds.approve on an active tenant membership', async ({
    client,
  }) => {
    const { customer, booking, company } = await setup()
    await confirm(customer, booking, 'payment-refund-retry-rbac')
    const original = fakeProvider.requestRefund.bind(fakeProvider)
    fakeProvider.requestRefund = async () => {
      throw new Error('initial failure')
    }
    await paymentService.cancelPaidBooking(
      'customer',
      customer.id,
      booking.id,
      'RBAC retry',
      'cancel-refund-retry-rbac'
    )
    fakeProvider.requestRefund = original
    const refund = await db.from('refunds').firstOrFail()
    const employee = await UserFactory.apply('user', 'verified').create()
    const membership = await CompanyMembership.create({
      companyId: company.id,
      userId: employee.id,
      role: 'accountant',
      status: 'active',
      joinedAt: DateTime.now(),
    })
    const abilities = ['client:company_app', `company:${company.id}`]
    const retry = () =>
      client
        .post(`/api/companies/refunds/${refund.id}/retry`)
        .json({ idempotencyKey: `refund-rbac-${crypto.randomUUID()}` })
        .withGuard('api')
        .loginAs(employee, abilities)
    ;(await retry()).assertStatus(403)
    membership.role = 'manager'
    await membership.save()
    await CompanyMembershipPermission.create({
      companyMembershipId: membership.id,
      permission: 'refunds.approve',
      effect: 'deny',
    })
    ;(await retry()).assertStatus(403)
    await CompanyMembershipPermission.query().where('companyMembershipId', membership.id).delete()
    membership.status = 'revoked'
    await membership.save()
    ;(await retry()).assertStatus(403)
  })

  test('refund success is exact, duplicate-safe, and terminal against late failure', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    const { payment } = await confirm(customer, booking, 'payment-refund-0001')
    const cancellation = await paymentService.cancelPaidBooking(
      'customer',
      customer.id,
      booking.id,
      'Plans changed',
      'cancel-refund-0001'
    )
    assert.equal(cancellation.amountMinor, '4503599627370496')
    const refund = await db.from('refunds').where('reference', cancellation.reference).firstOrFail()
    const event = {
      eventId: `evt_${crypto.randomUUID()}`,
      eventType: 'refund.succeeded',
      reference: refund.provider_refund_reference,
      amountMinor: String(refund.approved_amount_minor),
      currency: 'SAR',
      status: 'succeeded',
      occurredAt: new Date().toISOString(),
    }
    const raw = Buffer.from(JSON.stringify(event))
    const concurrent = await Promise.all([
      paymentService.processWebhook(raw, fakeProvider.sign(raw)),
      paymentService.processWebhook(raw, fakeProvider.sign(raw)),
    ])
    assert.sameMembers(
      concurrent.map((item) => item.outcome),
      ['processed', 'duplicate']
    )
    const late = Buffer.from(
      JSON.stringify({
        ...event,
        eventId: `evt_${crypto.randomUUID()}`,
        eventType: 'refund.failed',
        status: 'failed',
      })
    )
    assert.equal(
      (await paymentService.processWebhook(late, fakeProvider.sign(late))).outcome,
      'ignored'
    )
    assert.equal(
      (await db.from('payments').where('id', payment.id).firstOrFail()).status,
      'partially_refunded'
    )
    assert.equal(
      (await db.from('refunds').where('id', refund.id).firstOrFail()).status,
      'succeeded'
    )
  })

  test('refund amount and currency mismatches require reconciliation', async ({ assert }) => {
    const { customer, booking } = await setup()
    await confirm(customer, booking, 'payment-refund-0002')
    const cancellation = await paymentService.cancelPaidBooking(
      'customer',
      customer.id,
      booking.id,
      'Changed',
      'cancel-refund-0002'
    )
    const refund = await db.from('refunds').where('reference', cancellation.reference).firstOrFail()
    for (const override of [{ amountMinor: '1' }, { currency: 'USD' }]) {
      const event = {
        eventId: `evt_${crypto.randomUUID()}`,
        eventType: 'refund.succeeded',
        reference: refund.provider_refund_reference,
        amountMinor: String(refund.approved_amount_minor),
        currency: 'SAR',
        status: 'succeeded',
        occurredAt: new Date().toISOString(),
        ...override,
      }
      const raw = Buffer.from(JSON.stringify(event))
      assert.equal(
        (await paymentService.processWebhook(raw, fakeProvider.sign(raw))).outcome,
        'reconciliation_required'
      )
    }
    assert.equal(
      (await db.from('refunds').where('id', refund.id).firstOrFail()).status,
      'provider_pending'
    )
    assert.lengthOf(await db.from('reconciliation_records').where('result', 'refund_mismatch'), 2)
    const payment = await db.from('payments').where('id', refund.payment_id).firstOrFail()
    const over = (BigInt(payment.amount_paid_minor) + 1n).toString()
    await db.from('refunds').where('id', refund.id).update({
      requested_amount_minor: over,
      approved_amount_minor: over,
    })
    const overEvent = Buffer.from(
      JSON.stringify({
        eventId: `evt_${crypto.randomUUID()}`,
        eventType: 'refund.succeeded',
        reference: refund.provider_refund_reference,
        amountMinor: over,
        currency: 'SAR',
        status: 'succeeded',
        occurredAt: new Date().toISOString(),
      })
    )
    assert.equal(
      (await paymentService.processWebhook(overEvent, fakeProvider.sign(overEvent))).outcome,
      'reconciliation_required'
    )
  })

  test('refund failure may be followed by success without terminal regression', async ({
    assert,
  }) => {
    const { customer, booking } = await setup()
    await confirm(customer, booking, 'payment-refund-0003')
    const cancellation = await paymentService.cancelPaidBooking(
      'customer',
      customer.id,
      booking.id,
      'Changed',
      'cancel-refund-0003'
    )
    const refund = await db.from('refunds').where('reference', cancellation.reference).firstOrFail()
    const base = {
      reference: refund.provider_refund_reference,
      amountMinor: String(refund.approved_amount_minor),
      currency: 'SAR',
      occurredAt: new Date().toISOString(),
    }
    const failed = Buffer.from(
      JSON.stringify({
        ...base,
        eventId: `evt_${crypto.randomUUID()}`,
        eventType: 'refund.failed',
        status: 'failed',
      })
    )
    await paymentService.processWebhook(failed, fakeProvider.sign(failed))
    assert.equal((await db.from('refunds').where('id', refund.id).firstOrFail()).status, 'failed')
    const success = Buffer.from(
      JSON.stringify({
        ...base,
        eventId: `evt_${crypto.randomUUID()}`,
        eventType: 'refund.succeeded',
        status: 'succeeded',
      })
    )
    await paymentService.processWebhook(success, fakeProvider.sign(success))
    assert.equal(
      (await db.from('refunds').where('id', refund.id).firstOrFail()).status,
      'succeeded'
    )
  })

  test('customer and company cancellation retries are durable and conflicting reuse fails', async ({
    assert,
  }) => {
    const first = await setup()
    await confirm(first.customer, first.booking, 'payment-cancel-0001')
    const a = await paymentService.cancelPaidBooking(
      'customer',
      first.customer.id,
      first.booking.id,
      'Same reason',
      'cancel-idem-0001'
    )
    const b = await paymentService.cancelPaidBooking(
      'customer',
      first.customer.id,
      first.booking.id,
      'Same reason',
      'cancel-idem-0001'
    )
    assert.deepEqual(b, a)
    await assert.rejects(() =>
      paymentService.cancelPaidBooking(
        'customer',
        first.customer.id,
        first.booking.id,
        'Different reason',
        'cancel-idem-0001'
      )
    )
    const second = await setup()
    await confirm(second.customer, second.booking, 'payment-cancel-0002')
    const c = await paymentService.cancelPaidBooking(
      'company',
      second.owner.id,
      second.booking.id,
      'Provider closure',
      'cancel-idem-0002',
      second.company.id
    )
    const d = await paymentService.cancelPaidBooking(
      'company',
      second.owner.id,
      second.booking.id,
      'Provider closure',
      'cancel-idem-0002',
      second.company.id
    )
    assert.deepEqual(d, c)
    assert.equal(c.amountMinor, '9007199254740993')
  })

  test('no-refund cancellation also has durable idempotency', async ({ assert }) => {
    const { customer, booking, company, membership } = await setup()
    await paymentService.createPolicy(company.id, membership.id, {
      name: 'No refund',
      tiers: [{ minimumHours: 0, refundPercent: 0 }],
    })
    await confirm(customer, booking, 'payment-no-refund-1')
    const first = await paymentService.cancelPaidBooking(
      'customer',
      customer.id,
      booking.id,
      'Late cancellation',
      'cancel-no-refund-1'
    )
    const second = await paymentService.cancelPaidBooking(
      'customer',
      customer.id,
      booking.id,
      'Late cancellation',
      'cancel-no-refund-1'
    )
    assert.deepEqual(second, first)
    assert.equal(first.amountMinor, '0')
    assert.lengthOf(await db.from('booking_cancellation_idempotency'), 1)
    assert.lengthOf(await db.from('refunds'), 0)
  })

  test('simultaneous cancellation retries serialize for refundable and zero-refund cases', async ({
    assert,
  }) => {
    for (const refundPercent of [50, 0]) {
      const ctx = await setup()
      await paymentService.createPolicy(ctx.company.id, ctx.membership.id, {
        name: `Concurrent ${refundPercent}`,
        tiers: [{ minimumHours: 0, refundPercent }],
      })
      await confirm(ctx.customer, ctx.booking, `payment-concurrent-cancel-${refundPercent}`)
      const args = [
        'customer' as const,
        ctx.customer.id,
        ctx.booking.id,
        'Concurrent cancellation',
        `cancel-concurrent-${refundPercent}`,
      ] as const
      const [first, second] = await Promise.all([
        paymentService.cancelPaidBooking(...args),
        paymentService.cancelPaidBooking(...args),
      ])
      assert.deepEqual(second, first)
      assert.lengthOf(
        await db.from('booking_cancellation_idempotency').where('booking_id', ctx.booking.id),
        1
      )
      assert.lengthOf(
        await db.from('refunds').where('booking_id', ctx.booking.id),
        refundPercent ? 1 : 0
      )
      assert.lengthOf(
        await db
          .from('space_inventory_events')
          .where('action', 'booking.cancelled_after_payment')
          .whereRaw("metadata->>'bookingId' = ?", [String(ctx.booking.id)]),
        1
      )
    }
  })

  test('database rejects cross-tenant ownership writes and invalid transitions', async ({
    assert,
  }) => {
    const { customer, booking, company } = await setup()
    const other = await UserFactory.apply('user', 'verified').create()
    const payment = await paymentService.initiate(customer.id, booking.id, 'payment-db-0001')
    const badPayment = await databaseError(() =>
      db.table('payments').insert({
        reference: crypto.randomUUID(),
        user_id: other.id,
        company_id: company.id,
        booking_id: booking.id,
        purpose: 'deposit',
        status: 'pending',
        provider: 'fake',
        currency: 'SAR',
        expected_amount_minor: '1',
        booking_total_minor: '1',
        remaining_balance_minor: '0',
        created_at: new Date(),
      })
    )
    assert.equal(badPayment?.code, '23503')
    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    assert.equal(
      (
        await databaseError(() =>
          db.from('payment_attempts').where('id', attempt.id).update({ status: 'created' })
        )
      )?.code,
      '23514'
    )
    assert.equal(
      (
        await databaseError(() =>
          db.table('booking_invoice_snapshots').insert({
            payment_id: payment.id,
            booking_id: booking.id + 999,
            snapshot: {},
            created_at: new Date(),
          })
        )
      )?.code,
      '23503'
    )
    const success = Buffer.from(JSON.stringify(paymentEvent(attempt, payment)))
    await paymentService.processWebhook(success, fakeProvider.sign(success))
    const receipt = await db
      .from('booking_invoice_snapshots')
      .where('payment_id', payment.id)
      .firstOrFail()
    const publicReceipt = await paymentService.receipt(customer.id, Number(payment.id))
    assert.notProperty(publicReceipt, 'customerUserId')
    assert.notProperty(publicReceipt.customer, 'email')
    assert.equal(
      (
        await databaseError(() =>
          db
            .from('booking_invoice_snapshots')
            .where('id', receipt.id)
            .update({ snapshot: { tampered: true } })
        )
      )?.code,
      '23514'
    )
  })

  test('company finance APIs enforce tenant scope, deny overrides, and revoked membership', async ({
    client,
  }) => {
    const { customer, booking, company } = await setup()
    await paymentService.initiate(customer.id, booking.id, 'payment-rbac-0001')
    const employee = await UserFactory.apply('user', 'verified').create()
    const membership = await CompanyMembership.create({
      companyId: company.id,
      userId: employee.id,
      role: 'accountant',
      status: 'active',
      joinedAt: DateTime.now(),
    })
    const abilities = ['client:company_app', `company:${company.id}`]
    const allowed = await client
      .get('/api/companies/payments')
      .withGuard('api')
      .loginAs(employee, abilities)
    allowed.assertStatus(200)
    await CompanyMembershipPermission.create({
      companyMembershipId: membership.id,
      permission: 'finance.view',
      effect: 'deny',
    })
    const denied = await client
      .get('/api/companies/payments')
      .withGuard('api')
      .loginAs(employee, abilities)
    denied.assertStatus(403)
    await CompanyMembershipPermission.query().where('companyMembershipId', membership.id).delete()
    membership.status = 'revoked'
    await membership.save()
    const revoked = await client
      .get('/api/companies/payments')
      .withGuard('api')
      .loginAs(employee, abilities)
    revoked.assertStatus(403)
  })

  test('Sprint 6 rollback fails closed after real financial usage', async ({ assert }) => {
    const { customer, booking } = await setup()
    await confirm(customer, booking, 'payment-rollback-guard')
    await paymentService.cancelPaidBooking(
      'customer',
      customer.id,
      booking.id,
      'Rollback guard refund',
      'refund-rollback-guard'
    )
    await assert.rejects(
      () => new PaymentsMigration(db.connection(), import.meta.url).execDown(),
      /rollback refused/i
    )
    assert.lengthOf(await db.from('payments'), 1)
    assert.lengthOf(await db.from('payment_attempts'), 1)
    assert.lengthOf(await db.from('refunds'), 1)
    assert.lengthOf(await db.from('refund_attempts'), 1)
  })
})
