/* eslint-disable @unicorn/no-await-expression-member */
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import paymentService from '#services/payment_service'
import fakeProvider from '#services/fake_payment_provider'
import { withTruncateIsolation } from '#tests/support/database'
import { setup, paymentEvent } from '#tests/support/scenarios/payments'

test.group('Payments reconciliation', (group) => {
  group.each.setup(withTruncateIsolation)
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
})
