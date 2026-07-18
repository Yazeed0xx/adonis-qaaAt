/* eslint-disable @unicorn/no-await-expression-member */
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import paymentService from '#services/payment_service'
import bookingManagement from '#services/booking_management_service'
import fakeProvider from '#services/fake_payment_provider'
import { withTruncateIsolation } from '#tests/support/database'
import { setup, paymentEvent, confirm } from '#tests/support/scenarios/payments'

test.group('Payments cancellations', (group) => {
  group.each.setup(withTruncateIsolation)
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
})
