import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { createCustomer } from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { withTruncateIsolation } from '#tests/support/database'
import { confirm, setup } from '#tests/support/scenarios/payments'

test.group('Customer payment HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('payable summary and initiation use authoritative exact money and idempotency', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { customer, booking } = await setup()
    const payable = await client
      .visit('user_payments.payable', { bookingId: booking.id })
      .withGuard('api')
      .loginAs(customer)
    payable.assertStatus(200)
    payable.assertBodyContains({
      data: {
        bookingId: booking.id,
        purpose: 'full_payment',
        payableAmountMinor: '9007199254740993',
        bookingTotalMinor: '9007199254740993',
      },
    })
    const input = { idempotencyKey: 'customer-payment-http-001' }
    const first = await client
      .visit('user_payments.initiate', { bookingId: booking.id })
      .withGuard('api')
      .loginAs(customer)
      .json(input)
    first.assertStatus(200)
    const replay = await client
      .visit('user_payments.initiate', { bookingId: booking.id })
      .withGuard('api')
      .loginAs(customer)
      .json(input)
    replay.assertStatus(200)
    assert.equal(first.body().data.reference, replay.body().data.reference)
    assert.equal(first.body().data.expectedAmountMinor, '9007199254740993')
    assert.lengthOf(await db.from('payments'), 1)
    assert.lengthOf(await db.from('payment_attempts'), 1)

    const invalid = await client
      .visit('user_payments.initiate', { bookingId: booking.id })
      .withGuard('api')
      .loginAs(customer)
      .json({ idempotencyKey: 'short' })
    invalid.assertStatus(422)
  })

  test('owned payment list, detail, and receipt hide another customer', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { customer, booking } = await setup()
    const outsider = await createCustomer()
    const { payment } = await confirm(customer, booking, 'customer-payment-read-001')
    const list = await client.visit('user_payments.index').withGuard('api').loginAs(customer)
    list.assertStatus(200)
    assert.equal(list.body().data[0].id, String(payment.id))
    const detail = await client
      .visit('user_payments.show', { id: payment.id })
      .withGuard('api')
      .loginAs(customer)
    detail.assertStatus(200)
    detail.assertBodyContains({ data: { status: 'paid', amountPaidMinor: '9007199254740993' } })
    const receipt = await client
      .visit('user_payments.receipt', { id: payment.id })
      .withGuard('api')
      .loginAs(customer)
    receipt.assertStatus(200)
    receipt.assertBodyContains({
      data: { status: 'receipt_available', amountPaidMinor: '9007199254740993' },
    })
    for (const route of ['user_payments.show', 'user_payments.receipt'] as const) {
      const hidden = await client
        .visit(route, { id: payment.id })
        .withGuard('api')
        .loginAs(outsider)
      hidden.assertStatus(404)
    }
  })

  test('customer cancellation creates an owned refund and releases confirmed inventory', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { customer, booking } = await setup()
    await confirm(customer, booking, 'customer-cancel-http-payment')
    const cancelled = await client
      .visit('user_payments.cancel', { bookingId: booking.id })
      .withGuard('api')
      .loginAs(customer)
      .json({ reason: 'Customer plans changed', idempotencyKey: 'customer-cancel-http-001' })
    cancelled.assertStatus(200)
    cancelled.assertBodyContains({ data: { status: 'requested', amountMinor: '4503599627370496' } })
    const refund = await db.from('refunds').where('booking_id', booking.id).firstOrFail()
    const own = await client
      .visit('user_payments.refund', { id: refund.id })
      .withGuard('api')
      .loginAs(customer)
    own.assertStatus(200)
    own.assertBodyContains({
      data: { status: 'provider_pending', approvedAmountMinor: '4503599627370496' },
    })
    const storedBooking = await db.from('bookings').where('id', booking.id).firstOrFail()
    const block = await db
      .from('space_inventory_blocks')
      .where('booking_id', booking.id)
      .firstOrFail()
    assert.equal(storedBooking.status, 'cancelled')
    assert.equal(block.status, 'released')
  })
})
