import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import paymentService from '#services/payment_service'
import fakeProvider from '#services/fake_payment_provider'
import paymentConfig from '#config/payment'
import { paymentProvider } from '#services/payment_provider_service'
import { withTruncateIsolation } from '#tests/support/database'
import { setup, confirm, attachDepositQuote } from '#tests/support/scenarios/payments'

test.group('Payments initiation', (group) => {
  group.each.setup(withTruncateIsolation)
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
})
