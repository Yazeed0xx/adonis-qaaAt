/* eslint-disable @unicorn/no-await-expression-member */
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import paymentService from '#services/payment_service'
import fakeProvider from '#services/fake_payment_provider'
import { withTruncateIsolation } from '#tests/support/database'
import { setup, paymentEvent, postRawWebhook } from '#tests/support/scenarios/payments'

test.group('Payments webhooks', (group) => {
  group.each.setup(withTruncateIsolation)
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
})
