import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { CompanyFactory } from '#database/factories/company_factory'
import User from '#models/user'
import { createAdmin, createApprovedCompanyOwner, createCompanyMember } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'

test.group('Admin company moderation', (group) => {
  group.each.setup(withTruncateIsolation)

  test('approves a company with audit and durable notification intent in one commit', async ({
    client,
    assert,
  }) => {
    const admin = await createAdmin({ email: 'approvals.admin@example.com' })
    const company = await CompanyFactory.apply('pending')
      .with('user', 1, (user) => user.apply('company', 'verified'))
      .with('companyProfile', 1, (profile) => profile.merge({ companyName: 'Approval Events' }))
      .create()

    const response = await client
      .visit('admin.approve_company', { id: company.id })
      .withGuard('api')
      .loginAs(admin)

    response.assertStatus(200)
    response.assertBodyContains({
      data: { id: company.id, status: 'approved', approvedBy: admin.id },
    })
    const stored = await db.from('companies').where('id', company.id).firstOrFail()
    assert.equal(stored.status, 'approved')
    assert.lengthOf(
      await db.from('admin_audit_logs').where({ action: 'company.approve', target_id: company.id }),
      1
    )
    const outbox = await db.from('notification_outbox').firstOrFail()
    assert.equal(outbox.payload.userId, company.userId)
    assert.equal(outbox.payload.clientContext, 'company_app')
    assert.equal(outbox.payload.type, 'company_approved')
    assert.lengthOf(await db.from('notifications'), 0)
  })

  test('rejects invalid moderation input without state, audit, or notification writes', async ({
    client,
    assert,
  }) => {
    const admin = await createAdmin({ email: 'reject.admin@example.com' })
    const company = await CompanyFactory.apply('pending')
      .with('user')
      .with('companyProfile')
      .create()

    const response = await client
      .visit('admin.reject_company', { id: company.id })
      .withGuard('api')
      .loginAs(admin)
      .json({ reason: 'short' })

    response.assertStatus(422)
    response.assertBodyContains({ error: { code: 'REJECTION_REASON_INVALID' } })
    const stored = await db.from('companies').where('id', company.id).firstOrFail()
    assert.equal(stored.status, 'pending')
    assert.lengthOf(await db.from('admin_audit_logs'), 0)
    assert.lengthOf(await db.from('notification_outbox'), 0)
  })

  test('suspension revokes company access without destroying customer access', async ({
    client,
    assert,
  }) => {
    const admin = await createAdmin({ email: 'suspend.admin@example.com' })
    const affected = await createApprovedCompanyOwner({
      user: { email: 'affected-owner@example.com', password: 'password123' },
    })
    const employee = await createCompanyMember(affected.company, 'manager', {
      email: 'affected-employee@example.com',
      password: 'password123',
    })

    const ownerToken = await User.accessTokens.create(affected.user, [
      'client:company_app',
      `company:${affected.company.id}`,
    ])
    const affectedEmployeeToken = await User.accessTokens.create(employee.user, [
      'client:company_app',
      `company:${affected.company.id}`,
    ])
    const customerToken = await User.accessTokens.create(employee.user, ['client:customer_app'])

    await db.table('push_installations').multiInsert([
      {
        user_id: affected.user.id,
        client_context: 'company_app',
        installation_id: 'affected-owner-company-installation',
        expo_push_token: 'ExponentPushToken[affected-owner-company]',
        platform: 'ios',
      },
      {
        user_id: employee.user.id,
        client_context: 'company_app',
        installation_id: 'affected-employee-company-installation',
        expo_push_token: 'ExponentPushToken[affected-employee-company]',
        platform: 'android',
      },
      {
        user_id: employee.user.id,
        client_context: 'customer_app',
        installation_id: 'affected-employee-customer-installation',
        expo_push_token: 'ExponentPushToken[affected-employee-customer]',
        platform: 'android',
      },
    ])

    const response = await client
      .visit('admin.suspend_company', { id: affected.company.id })
      .withGuard('api')
      .loginAs(admin)
      .json({ reason: 'Required compliance review' })

    response.assertStatus(200)
    response.assertBodyContains({ data: { id: affected.company.id, status: 'suspended' } })

    const remainingTokens = await User.accessTokens.all(employee.user)
    const remainingTokenIds = remainingTokens.map((token) => Number(token.identifier))
    assert.notInclude(remainingTokenIds, Number(affectedEmployeeToken.identifier))
    assert.include(remainingTokenIds, Number(customerToken.identifier))
    assert.lengthOf(
      await db
        .from('auth_access_tokens')
        .where('tokenable_id', affected.user.id)
        .where('id', Number(ownerToken.identifier)),
      0
    )

    const ownerCompanyPush = await db
      .from('push_installations')
      .where('installation_id', 'affected-owner-company-installation')
      .firstOrFail()
    assert.equal(ownerCompanyPush.notifications_enabled, false)
    assert.isNotNull(ownerCompanyPush.revoked_at)
    const employeeCompanyPush = await db
      .from('push_installations')
      .where('installation_id', 'affected-employee-company-installation')
      .firstOrFail()
    assert.equal(employeeCompanyPush.notifications_enabled, false)
    assert.isNotNull(employeeCompanyPush.revoked_at)
    const customerPush = await db
      .from('push_installations')
      .where('installation_id', 'affected-employee-customer-installation')
      .firstOrFail()
    assert.equal(customerPush.notifications_enabled, true)
    assert.isNull(customerPush.revoked_at)

    const affectedDenied = await client
      .get('/api/companies/members')
      .header('Authorization', `Bearer ${affectedEmployeeToken.value!.release()}`)
    affectedDenied.assertStatus(401)
    const customerAllowed = await client
      .get('/api/users/me')
      .header('Authorization', `Bearer ${customerToken.value!.release()}`)
    customerAllowed.assertStatus(200)

    const tokenIssuedAfterSuspension = await User.accessTokens.create(employee.user, [
      'client:company_app',
      `company:${affected.company.id}`,
    ])
    const suspendedStateDenied = await client
      .get('/api/companies/members')
      .header('Authorization', `Bearer ${tokenIssuedAfterSuspension.value!.release()}`)
    suspendedStateDenied.assertStatus(403)
    suspendedStateDenied.assertBodyContains({
      error: { code: 'COMPANY_SUSPENDED' },
    })

    assert.lengthOf(
      await db
        .from('admin_audit_logs')
        .where({ action: 'company.suspend', target_id: affected.company.id })
        .where('reason', 'Required compliance review'),
      1
    )

    const reactivate = await client
      .visit('admin.reactivate_company', { id: affected.company.id })
      .withGuard('api')
      .loginAs(admin)
      .json({ reason: 'Compliance review completed successfully' })
    reactivate.assertStatus(200)
    reactivate.assertBodyContains({ data: { id: affected.company.id, status: 'approved' } })

    const oldSessionRemainsRevoked = await client
      .get('/api/companies/members')
      .header('Authorization', `Bearer ${affectedEmployeeToken.value!.release()}`)
    oldSessionRemainsRevoked.assertStatus(401)
    const freshLogin = await client.post('/api/companies/login').json({
      email: employee.user.email,
      password: 'password123',
    })
    freshLogin.assertStatus(200)
    freshLogin.assertBodyContains({ data: { company: { id: affected.company.id } } })
    assert.lengthOf(
      await db
        .from('admin_audit_logs')
        .where({ action: 'company.reactivate', target_id: affected.company.id })
        .where('reason', 'Compliance review completed successfully'),
      1
    )
  })

  test('legacy company ban routes are not an alternate moderation path', async ({ client }) => {
    const admin = await createAdmin({ email: 'legacy-ban.admin@example.com' })
    const { company } = await createApprovedCompanyOwner()

    const ban = await client
      .post(`/api/admin/companies/${company.id}/ban`)
      .withGuard('api')
      .loginAs(admin)
    ban.assertStatus(404)

    const unban = await client
      .post(`/api/admin/companies/${company.id}/unban`)
      .withGuard('api')
      .loginAs(admin)
    unban.assertStatus(404)
  })
})
