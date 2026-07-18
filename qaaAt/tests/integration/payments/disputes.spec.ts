import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { AdminDisputeService } from '#services/admin_dispute_service'
import { createAdmin } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'
import { databaseError, setup } from '#tests/support/scenarios/payments'
import paymentService from '#services/payment_service'

test.group('Payment dispute invariants', (group) => {
  group.each.setup(withTruncateIsolation)

  test('concurrent opening produces one active dispute and terminal state is database-enforced', async ({
    assert,
  }) => {
    const scenario = await setup()
    const payment = await paymentService.initiate(
      scenario.customer.id,
      scenario.booking.id,
      'dispute-race-payment'
    )
    const admin = await createAdmin({ email: 'dispute-race-admin@example.com' })
    const disputes = await app.container.make(AdminDisputeService)

    const results = await Promise.allSettled([
      disputes.create(admin.id, {
        paymentId: Number(payment.id),
        reason: 'First concurrent dispute submission',
      }),
      disputes.create(admin.id, {
        paymentId: Number(payment.id),
        reason: 'Second concurrent dispute submission',
      }),
    ])
    assert.lengthOf(
      results.filter((result) => result.status === 'fulfilled'),
      1
    )
    assert.lengthOf(await db.from('payment_disputes'), 1)
    assert.lengthOf(await db.from('admin_audit_logs').where('action', 'payment_dispute.open'), 1)

    const dispute = await db.from('payment_disputes').firstOrFail()
    const error = await databaseError(() =>
      db
        .from('payment_disputes')
        .where('id', dispute.id)
        .update({ status: 'resolved', updated_at: new Date() })
    )
    assert.equal(error?.code, '23514')
  })
})
