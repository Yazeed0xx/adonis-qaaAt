import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import fakeProvider from '#services/fake_payment_provider'
import paymentService from '#services/payment_service'
import { createAdmin, createCustomer } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'
import { confirm, setup } from '#tests/support/scenarios/payments'

test.group('Admin finance operations', (group) => {
  group.each.setup(withTruncateIsolation)

  test('opens and resolves an auditable dispute without mutating payment state', async ({
    client,
    assert,
  }) => {
    const scenario = await setup()
    const { payment } = await confirm(scenario.customer, scenario.booking, 'admin-dispute-payment')
    const admin = await createAdmin({ email: 'dispute-admin@example.com' })
    const customer = await createCustomer({ email: 'dispute-denied@example.com' })

    const denied = await client
      .post('/api/admin/disputes')
      .withGuard('api')
      .loginAs(customer, ['client:customer_app'])
      .json({ paymentId: Number(payment.id), reason: 'Customer reported duplicate collection' })
    denied.assertStatus(403)

    const opened = await client
      .post('/api/admin/disputes')
      .withGuard('api')
      .loginAs(admin)
      .json({ paymentId: Number(payment.id), reason: 'Customer reported duplicate collection' })
    opened.assertStatus(201)
    opened.assertBodyContains({
      data: {
        paymentId: String(payment.id),
        bookingId: scenario.booking.id,
        status: 'open',
      },
    })
    const disputeId = opened.body().data.id

    const duplicate = await client
      .post('/api/admin/disputes')
      .withGuard('api')
      .loginAs(admin)
      .json({ paymentId: Number(payment.id), reason: 'Duplicate active dispute request' })
    duplicate.assertStatus(409)
    duplicate.assertBodyContains({ error: { code: 'PAYMENT_DISPUTE_ACTIVE' } })

    const review = await client
      .patch(`/api/admin/disputes/${disputeId}`)
      .withGuard('api')
      .loginAs(admin)
      .json({ status: 'under_review' })
    review.assertStatus(200)

    const missingResolution = await client
      .patch(`/api/admin/disputes/${disputeId}`)
      .withGuard('api')
      .loginAs(admin)
      .json({ status: 'resolved' })
    missingResolution.assertStatus(422)
    missingResolution.assertBodyContains({
      error: { code: 'PAYMENT_DISPUTE_RESOLUTION_REQUIRED' },
    })

    const resolved = await client
      .patch(`/api/admin/disputes/${disputeId}`)
      .withGuard('api')
      .loginAs(admin)
      .json({ status: 'resolved', resolution: 'Provider confirmed that only one charge settled.' })
    resolved.assertStatus(200)
    resolved.assertBodyContains({ data: { status: 'resolved' } })
    const storedPayment = await db.from('payments').where('id', payment.id).firstOrFail()
    assert.equal(storedPayment.status, 'paid')
    const disputeAuditLogs = await db
      .from('admin_audit_logs')
      .where('target_type', 'payment_dispute')
      .orderBy('id')
    assert.deepEqual(
      disputeAuditLogs.map((row) => row.action),
      ['payment_dispute.open', 'payment_dispute.under_review', 'payment_dispute.resolved']
    )
  })

  test('admin can retry a failed refund through the existing provider workflow', async ({
    client,
    assert,
  }) => {
    const scenario = await setup()
    await confirm(scenario.customer, scenario.booking, 'admin-refund-payment')
    const original = fakeProvider.requestRefund.bind(fakeProvider)
    fakeProvider.requestRefund = async () => {
      throw new Error('provider unavailable')
    }
    try {
      await paymentService.cancelPaidBooking(
        'customer',
        scenario.customer.id,
        scenario.booking.id,
        'Administrative retry required',
        'admin-refund-cancel'
      )
    } finally {
      fakeProvider.requestRefund = original
    }
    const refund = await db.from('refunds').firstOrFail()
    const admin = await createAdmin({ email: 'refund-admin@example.com' })

    const response = await client
      .post(`/api/admin/finance/refunds/${refund.id}/retry`)
      .withGuard('api')
      .loginAs(admin)
      .json({ idempotencyKey: 'admin-refund-retry-1' })
    response.assertStatus(200)
    const latestAttempt = await db.from('refund_attempts').orderBy('id', 'desc').firstOrFail()
    assert.equal(latestAttempt.status, 'provider_pending')
    assert.lengthOf(
      await db.from('admin_audit_logs').where({ action: 'refund.retry', target_id: refund.id }),
      1
    )
  })
})
