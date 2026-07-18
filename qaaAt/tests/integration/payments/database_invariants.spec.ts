/* eslint-disable @unicorn/no-await-expression-member */
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import paymentService from '#services/payment_service'
import fakeProvider from '#services/fake_payment_provider'
import { withTruncateIsolation } from '#tests/support/database'
import { setup, paymentEvent, databaseError } from '#tests/support/scenarios/payments'

test.group('Payments database invariants', (group) => {
  group.each.setup(withTruncateIsolation)
  test('database rejects cross-tenant ownership writes and exposes a redacted receipt', async ({
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
    const publicReceipt = await paymentService.receipt(customer.id, Number(payment.id))
    assert.notProperty(publicReceipt, 'customerUserId')
    assert.notProperty(publicReceipt.customer, 'email')
  })
})
