import { test } from '@japa/runner'
import database from '@adonisjs/lucid/services/db'
import User from '#models/user'
import CompanyMembershipPermission from '#models/company_membership_permission'
import {
  createApprovedCompanyOwner,
  createCompanyMember,
  createCustomer,
  createMembership,
} from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'

test.group('Company member mutations', (group) => {
  group.each.setup(withTruncateIsolation)

  test('database permits at most one current company membership per user', async ({ assert }) => {
    const first = await createApprovedCompanyOwner({ user: { email: 'first-owner@example.com' } })
    const second = await createApprovedCompanyOwner({ user: { email: 'second-owner@example.com' } })

    await assert.rejects(
      () => createMembership(second.company, first.user, 'viewer'),
      /company_memberships_one_current_per_user_unique/
    )
  })

  test('owner updates a member role and permission overrides with an audit event', async ({
    client,
    db,
  }) => {
    const owner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const employee = await createCompanyMember(owner.company, 'viewer', {
      email: 'employee@example.com',
    })

    const response = await client
      .patch(`/api/companies/members/${employee.membership.id}`)
      .withGuard('api')
      .loginAs(owner.user, companyTokenAbilities(owner.company))
      .json({
        role: 'booking_staff',
        permissionOverrides: [{ permission: 'quotes.manage', effect: 'deny' }],
      })

    response.assertStatus(200)
    response.assertBodyContains({
      message: 'Member updated successfully',
      data: {
        id: employee.membership.id,
        role: 'booking_staff',
        permissionOverrides: [{ permission: 'quotes.manage', effect: 'deny' }],
      },
    })
    db.assertHas('company_memberships', { id: employee.membership.id, role: 'booking_staff' })
    db.assertHas('company_membership_permissions', {
      company_membership_id: employee.membership.id,
      permission: 'quotes.manage',
      effect: 'deny',
    })
    db.assertHas('company_audit_logs', {
      company_id: owner.company.id,
      actor_user_id: owner.user.id,
      action: 'membership.updated',
      target_id: employee.membership.id,
    })
  })

  test('wrong tenant and missing permission leave the membership unchanged', async ({
    client,
    db,
  }) => {
    const first = await createApprovedCompanyOwner({ user: { email: 'first@example.com' } })
    const employee = await createCompanyMember(first.company, 'viewer', {
      email: 'employee@example.com',
    })
    const second = await createApprovedCompanyOwner({ user: { email: 'second@example.com' } })
    const viewer = await createCompanyMember(first.company, 'viewer', {
      email: 'viewer@example.com',
    })

    const wrongTenant = await client
      .patch(`/api/companies/members/${employee.membership.id}`)
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
      .json({ role: 'manager' })
    wrongTenant.assertStatus(404)

    const forbidden = await client
      .patch(`/api/companies/members/${employee.membership.id}`)
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
      .json({ role: 'manager' })
    forbidden.assertStatus(403)
    forbidden.assertBodyContains({ error: { code: 'COMPANY_PERMISSION_REQUIRED' } })

    db.assertHas('company_memberships', { id: employee.membership.id, role: 'viewer' })
    db.assertMissing('company_audit_logs', { target_id: employee.membership.id })
  })

  test('non-owners cannot manage owners or delegate permissions they do not hold', async ({
    client,
    db,
  }) => {
    const owner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const manager = await createCompanyMember(owner.company, 'manager', {
      email: 'manager@example.com',
    })
    const limited = await createCompanyMember(owner.company, 'booking_staff', {
      email: 'limited@example.com',
    })
    await CompanyMembershipPermission.create({
      companyMembershipId: limited.membership.id,
      permission: 'members.manage',
      effect: 'allow',
    })

    const promoteSelf = await client
      .patch(`/api/companies/members/${manager.membership.id}`)
      .withGuard('api')
      .loginAs(manager.user, companyTokenAbilities(manager.membership.companyId))
      .json({ role: 'owner' })
    promoteSelf.assertStatus(403)
    promoteSelf.assertBodyContains({ error: { code: 'OWNER_MANAGEMENT_REQUIRES_OWNER' } })

    const modifyOwner = await client
      .patch(`/api/companies/members/${owner.membership.id}`)
      .withGuard('api')
      .loginAs(manager.user, companyTokenAbilities(manager.membership.companyId))
      .json({ status: 'suspended' })
    modifyOwner.assertStatus(403)

    const grantPayout = await client
      .patch(`/api/companies/members/${limited.membership.id}`)
      .withGuard('api')
      .loginAs(manager.user, companyTokenAbilities(manager.membership.companyId))
      .json({ permissionOverrides: [{ permission: 'payout_settings.manage', effect: 'allow' }] })
    grantPayout.assertStatus(403)
    grantPayout.assertBodyContains({ error: { code: 'PAYOUT_PERMISSION_REQUIRES_OWNER' } })

    const exceedDelegation = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(limited.user, companyTokenAbilities(limited.membership.companyId))
      .json({ name: 'Too Powerful', email: 'power@example.com', role: 'manager' })
    exceedDelegation.assertStatus(403)
    exceedDelegation.assertBodyContains({ error: { code: 'PERMISSION_DELEGATION_EXCEEDED' } })

    db.assertHas('company_memberships', {
      id: owner.membership.id,
      role: 'owner',
      status: 'active',
    })
    db.assertHas('company_memberships', { id: manager.membership.id, role: 'manager' })
  })

  test('the last active owner cannot be demoted or revoked', async ({ client, db }) => {
    const owner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })

    const demote = await client
      .patch(`/api/companies/members/${owner.membership.id}`)
      .withGuard('api')
      .loginAs(owner.user, companyTokenAbilities(owner.company))
      .json({ role: 'manager' })
    demote.assertStatus(409)
    demote.assertBodyContains({ error: { code: 'LAST_ACTIVE_OWNER' } })

    const revoke = await client
      .delete(`/api/companies/members/${owner.membership.id}`)
      .withGuard('api')
      .loginAs(owner.user, companyTokenAbilities(owner.company))
    revoke.assertStatus(409)
    revoke.assertBodyContains({ error: { code: 'LAST_ACTIVE_OWNER' } })
    db.assertHas('company_memberships', {
      id: owner.membership.id,
      role: 'owner',
      status: 'active',
    })
  })

  test('suspension revokes company access while preserving customer access', async ({
    client,
    assert,
    db,
  }) => {
    const first = await createApprovedCompanyOwner({ user: { email: 'first-owner@example.com' } })
    const employee = await createCustomer({ email: 'employee@example.com' })
    const firstMembership = await createMembership(first.company, employee, 'manager')
    const firstToken = await User.accessTokens.create(employee, [
      'client:company_app',
      `company:${first.company.id}`,
    ])
    const customerToken = await User.accessTokens.create(employee, ['client:customer_app'])
    const firstTokenValue = firstToken.value!.release()
    await database.table('push_installations').insert({
      user_id: employee.id,
      client_context: 'company_app',
      installation_id: 'suspended-member-company-installation',
      expo_push_token: 'ExponentPushToken[suspended-member-company]',
      platform: 'ios',
    })

    const before = await client
      .get('/api/companies/members')
      .header('Authorization', `Bearer ${firstTokenValue}`)
    before.assertStatus(200)

    const response = await client
      .patch(`/api/companies/members/${firstMembership.id}`)
      .withGuard('api')
      .loginAs(first.user, companyTokenAbilities(first.company))
      .json({ status: 'suspended' })
    response.assertStatus(200)

    const denied = await client
      .get('/api/companies/members')
      .header('Authorization', `Bearer ${firstTokenValue}`)
    denied.assertStatus(401)
    const tokenRows = await User.accessTokens.all(employee)
    const ids = tokenRows.map((token) => Number(token.identifier))
    assert.notInclude(ids, Number(firstToken.identifier))
    assert.include(ids, Number(customerToken.identifier))
    const installation = await database
      .from('push_installations')
      .where('installation_id', 'suspended-member-company-installation')
      .firstOrFail()
    assert.equal(installation.notifications_enabled, false)
    assert.isNotNull(installation.revoked_at)
    db.assertHas('company_audit_logs', {
      company_id: first.company.id,
      action: 'membership.updated',
      target_id: firstMembership.id,
    })
  })

  test('a revoked historical membership cannot reactivate while another company is current', async ({
    client,
    db,
  }) => {
    const first = await createApprovedCompanyOwner({ user: { email: 'first-owner@example.com' } })
    const second = await createApprovedCompanyOwner({ user: { email: 'second-owner@example.com' } })
    const employee = await createCompanyMember(first.company, 'manager', {
      email: 'historical-member@example.com',
    })
    await database
      .from('company_memberships')
      .where('id', employee.membership.id)
      .update({ status: 'revoked' })
    await createMembership(second.company, employee.user, 'manager')

    const response = await client
      .patch(`/api/companies/members/${employee.membership.id}`)
      .withGuard('api')
      .loginAs(first.user, companyTokenAbilities(first.company))
      .json({ status: 'active' })

    response.assertStatus(409)
    response.assertBodyContains({ error: { code: 'COMPANY_MEMBERSHIP_LIMIT_REACHED' } })
    db.assertHas('company_memberships', { id: employee.membership.id, status: 'revoked' })
  })

  test('revocation removes company access without deleting the shared identity', async ({
    client,
    assert,
    db,
  }) => {
    const owner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const employee = await createCompanyMember(owner.company, 'manager', {
      email: 'employee@example.com',
    })
    const companyToken = await User.accessTokens.create(employee.user, [
      'client:company_app',
      `company:${owner.company.id}`,
    ])
    const customerToken = await User.accessTokens.create(employee.user, ['client:customer_app'])
    const companyTokenValue = companyToken.value!.release()

    const response = await client
      .delete(`/api/companies/members/${employee.membership.id}`)
      .withGuard('api')
      .loginAs(owner.user, companyTokenAbilities(owner.company))
    response.assertStatus(204)

    const denied = await client
      .get('/api/companies/members')
      .header('Authorization', `Bearer ${companyTokenValue}`)
    denied.assertStatus(401)
    const remainingTokens = await User.accessTokens.all(employee.user)
    const remainingIds = remainingTokens.map((token) => Number(token.identifier))
    assert.notInclude(remainingIds, Number(companyToken.identifier))
    assert.include(remainingIds, Number(customerToken.identifier))
    db.assertModelExists(employee.user)
    db.assertHas('company_memberships', { id: employee.membership.id, status: 'revoked' })
    db.assertHas('company_audit_logs', {
      company_id: owner.company.id,
      action: 'membership.updated',
      target_id: employee.membership.id,
    })
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
