/* eslint-disable @unicorn/no-await-expression-member */
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import paymentService from '#services/payment_service'
import fakeProvider from '#services/fake_payment_provider'
import { withTruncateIsolation } from '#tests/support/database'
import { setup, confirm } from '#tests/support/scenarios/payments'

test.group('Payments refunds', (group) => {
  group.each.setup(withTruncateIsolation)
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
})
