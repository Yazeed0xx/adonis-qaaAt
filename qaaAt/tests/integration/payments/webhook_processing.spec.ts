/* eslint-disable @unicorn/no-await-expression-member */
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import paymentService from '#services/payment_service'
import fakeProvider from '#services/fake_payment_provider'
import { withTruncateIsolation } from '#tests/support/database'
import { setup, paymentEvent } from '#tests/support/scenarios/payments'

test.group('Payments webhook processing', (group) => {
  group.each.setup(withTruncateIsolation)
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
})
