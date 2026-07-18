import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import adminAuditService from '#services/admin_audit_service'
import { createAdmin } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'
import { setup } from '#tests/support/scenarios/payments'

test.group('Admin audit-log access', (group) => {
  group.each.setup(withTruncateIsolation)

  test('validates the requested scope and paginates normalized audit entries', async ({
    client,
  }) => {
    const scenario = await setup()
    const admin = await createAdmin({ email: 'audit-reader@example.com' })
    await adminAuditService.record({
      adminUserId: admin.id,
      action: 'test.admin_action',
      targetType: 'company',
      targetId: scenario.company.id,
      metadata: { safe: true },
    })
    await db.table('company_audit_logs').insert({
      company_id: scenario.company.id,
      actor_user_id: scenario.owner.id,
      action: 'test.company_action',
      target_type: 'company',
      target_id: scenario.company.id,
      metadata: { safe: true },
      created_at: new Date(),
    })
    await db.table('booking_audit_logs').insert({
      actor_user_id: scenario.owner.id,
      booking_id: scenario.booking.id,
      company_id: scenario.company.id,
      action: 'test.booking_action',
      previous_status: 'pending',
      next_status: 'accepted',
      metadata: { safe: true },
      created_at: new Date(),
    })

    const adminLogs = await client
      .get('/api/admin/audit-logs')
      .withGuard('api')
      .loginAs(admin)
      .qs({ scope: 'admin', action: 'test.admin_action', page: 1, limit: 1 })
    adminLogs.assertStatus(200)
    adminLogs.assertBodyContains({
      data: [
        {
          scope: 'admin',
          actorUserId: admin.id,
          action: 'test.admin_action',
          targetType: 'company',
          targetId: scenario.company.id,
        },
      ],
      metadata: { perPage: 1, currentPage: 1 },
    })

    const companyLogs = await client
      .get('/api/admin/audit-logs')
      .withGuard('api')
      .loginAs(admin)
      .qs({ scope: 'company', companyId: scenario.company.id })
    companyLogs.assertStatus(200)
    companyLogs.assertBodyContains({
      data: [{ scope: 'company', action: 'test.company_action' }],
    })

    const bookingLogs = await client
      .get('/api/admin/audit-logs')
      .withGuard('api')
      .loginAs(admin)
      .qs({ scope: 'booking', targetId: scenario.booking.id })
    bookingLogs.assertStatus(200)
    bookingLogs.assertBodyContains({
      data: [
        {
          scope: 'booking',
          action: 'test.booking_action',
          previousStatus: 'pending',
          nextStatus: 'accepted',
        },
      ],
    })

    const invalid = await client
      .get('/api/admin/audit-logs')
      .withGuard('api')
      .loginAs(admin)
      .qs({ scope: 'everything' })
    invalid.assertStatus(422)
  })
})
