import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import CompanyMembership from '#models/company_membership'
import { UserFactory } from '#database/factories/user_factory'
import { CompanyFactory } from '#database/factories/company_factory'
import { CompanyMembershipService } from '#services/company_membership_service'

async function createApprovedCompany() {
  const owner = await UserFactory.apply('company', 'verified').create()
  const company = await CompanyFactory.apply('approved')
    .merge({ userId: owner.id })
    .with('companyProfile')
    .create()
  const membership = await CompanyMembership.create({
    companyId: company.id,
    userId: owner.id,
    role: 'owner',
    status: 'active',
    joinedAt: company.createdAt,
  })
  return { owner, company, membership }
}

async function deliveredInvitationToken() {
  const row = await db.from('notification_outbox').orderBy('id', 'desc').firstOrFail()
  const match = String(row.payload.message).match(/[?&]token=([^\s]+)/)
  if (!match) throw new Error('Invitation delivery did not contain an acceptance token')
  return match[1]
}

test.group('Company memberships and invitations', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('owner invites an existing customer and acceptance reuses the identity', async ({
    client,
    assert,
  }) => {
    const { owner, company } = await createApprovedCompany()
    const employee = await UserFactory.apply('user', 'verified')
      .merge({ email: 'employee@example.com', password: 'password123' })
      .create()

    const createResponse = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(owner)
      .json({ name: 'Employee', email: employee.email, role: 'booking_staff' })
    createResponse.assertStatus(201)
    assert.notProperty(createResponse.body().data, 'acceptanceToken')
    assert.equal(JSON.stringify(createResponse.body()).includes('token='), false)
    const token = await deliveredInvitationToken()

    const inspectResponse = await client.get(`/api/company-invitations/inspect?token=${token}`)
    inspectResponse.assertStatus(200)
    assert.notEqual(inspectResponse.body().data.invitedEmail, employee.email)
    assert.notProperty(inspectResponse.body().data, 'tokenHash')

    const acceptResponse = await client
      .post('/api/company-invitations/accept')
      .withGuard('api')
      .loginAs(employee)
      .json({ token, password: 'must-not-replace-password' })
    acceptResponse.assertStatus(201)

    const membership = await CompanyMembership.query()
      .where('companyId', company.id)
      .where('userId', employee.id)
      .firstOrFail()
    assert.equal(membership.role, 'booking_staff')
    const verifiedEmployee = await User.verifyCredentials(employee.email, 'password123')
    assert.equal(verifiedEmployee.id, employee.id)
    assert.equal(
      await User.query()
        .where('email', employee.email)
        .count('* as total')
        .then((rows) => Number(rows[0].$extras.total)),
      1
    )
    assert.equal(
      await db
        .from('company_audit_logs')
        .where('action', 'invitation.accepted')
        .count('* as total')
        .then((row) => Number(row[0].total)),
      1
    )
  })

  test('new unauthenticated invitee creates an account from the delivered email proof', async ({
    client,
    assert,
  }) => {
    const { owner, company } = await createApprovedCompany()
    const invite = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(owner)
      .json({ name: 'New Employee', email: 'new.employee@example.com', role: 'viewer' })
    invite.assertStatus(201)
    const token = await deliveredInvitationToken()

    const accepted = await client.post('/api/company-invitations/accept').json({
      token,
      email: 'attacker@example.com',
      name: 'New Employee',
      password: 'strong-password-123',
    })
    accepted.assertStatus(201)
    const user = await User.findByOrFail('email', 'new.employee@example.com')
    assert.equal(await User.findBy('email', 'attacker@example.com'), null)
    assert.equal(
      await CompanyMembership.query()
        .where('companyId', company.id)
        .where('userId', user.id)
        .count('* as total')
        .then((rows) => Number(rows[0].$extras.total)),
      1
    )
    const verifiedUser = await User.verifyCredentials(user.email, 'strong-password-123')
    assert.equal(verifiedUser.id, user.id)
  })

  test('existing invitee must authenticate and invitation never replaces the password', async ({
    client,
  }) => {
    const { owner } = await createApprovedCompany()
    const employee = await UserFactory.apply('user', 'verified')
      .merge({ email: 'existing@example.com', password: 'original-password' })
      .create()
    await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(owner)
      .json({ name: 'Existing', email: employee.email, role: 'viewer' })
    const token = await deliveredInvitationToken()
    const unauthenticated = await client.post('/api/company-invitations/accept').json({
      token,
      password: 'replacement-password',
    })
    unauthenticated.assertStatus(401)
    const authenticated = await client
      .post('/api/company-invitations/accept')
      .withGuard('api')
      .loginAs(employee)
      .json({ token, password: 'replacement-password' })
    authenticated.assertStatus(201)
    await User.verifyCredentials(employee.email, 'original-password')
  })

  test('email is required and phone-only invitations are rejected', async ({ client }) => {
    const { owner } = await createApprovedCompany()
    const response = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(owner)
      .json({ name: 'Phone Only', phone: '+966500000000', role: 'viewer' })
    response.assertStatus(422)
    response.assertBodyContains({ error: { code: 'VALIDATION_ERROR' } })
  })

  test('create list and resend never expose invitation secrets', async ({ client, assert }) => {
    const { owner } = await createApprovedCompany()
    const created = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(owner)
      .json({ name: 'Secret', email: 'secret@example.com', role: 'viewer' })
    created.assertStatus(201)
    const firstToken = await deliveredInvitationToken()
    for (const body of [created.body()]) {
      assert.equal(JSON.stringify(body).includes(firstToken), false)
      assert.equal(JSON.stringify(body).includes('tokenHash'), false)
    }
    const invitationId = created.body().data.id
    const resent = await client
      .post(`/api/companies/invitations/${invitationId}/resend`)
      .withGuard('api')
      .loginAs(owner)
    resent.assertStatus(200)
    const secondToken = await deliveredInvitationToken()
    assert.notEqual(secondToken, firstToken)
    const listed = await client.get('/api/companies/invitations').withGuard('api').loginAs(owner)
    listed.assertStatus(200)
    for (const body of [resent.body(), listed.body()]) {
      assert.equal(JSON.stringify(body).includes(firstToken), false)
      assert.equal(JSON.stringify(body).includes(secondToken), false)
      assert.equal(JSON.stringify(body).includes('tokenHash'), false)
      assert.equal(JSON.stringify(body).includes('acceptanceToken'), false)
    }
  })

  test('tenant scoping prevents another company from mutating a membership', async ({
    client,
    assert,
  }) => {
    const first = await createApprovedCompany()
    const second = await createApprovedCompany()
    const response = await client
      .patch(`/api/companies/members/${first.membership.id}`)
      .withGuard('api')
      .loginAs(second.owner)
      .json({ role: 'viewer' })
    response.assertStatus(404)
    await first.membership.refresh()
    assert.equal(first.membership.role, 'owner')
  })

  test('last active owner cannot be removed', async ({ client }) => {
    const { owner, membership } = await createApprovedCompany()
    const response = await client
      .delete(`/api/companies/members/${membership.id}`)
      .withGuard('api')
      .loginAs(owner)
    response.assertStatus(409)
    response.assertBodyContains({ error: { code: 'LAST_ACTIVE_OWNER' } })
  })

  test('viewer cannot invite members', async ({ client }) => {
    const { company } = await createApprovedCompany()
    const viewer = await UserFactory.apply('user', 'verified').create()
    await CompanyMembership.create({
      companyId: company.id,
      userId: viewer.id,
      role: 'viewer',
      status: 'active',
      joinedAt: company.createdAt,
    })
    const response = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(viewer)
      .json({ name: 'No Access', email: 'blocked@example.com', role: 'viewer' })
    response.assertStatus(403)
    response.assertBodyContains({ error: { code: 'COMPANY_PERMISSION_REQUIRED' } })
  })

  test('non-owner cannot promote owners, modify owners, or exceed delegated permissions', async ({
    client,
  }) => {
    const { company, membership: ownerMembership } = await createApprovedCompany()
    const manager = await UserFactory.apply('user', 'verified').create()
    const managerMembership = await CompanyMembership.create({
      companyId: company.id,
      userId: manager.id,
      role: 'manager',
      status: 'active',
      joinedAt: company.createdAt,
    })
    const limited = await UserFactory.apply('user', 'verified').create()
    const limitedMembership = await CompanyMembership.create({
      companyId: company.id,
      userId: limited.id,
      role: 'booking_staff',
      status: 'active',
      joinedAt: company.createdAt,
    })
    await db.table('company_membership_permissions').insert({
      company_membership_id: limitedMembership.id,
      permission: 'members.manage',
      effect: 'allow',
    })

    const promoteSelf = await client
      .patch(`/api/companies/members/${managerMembership.id}`)
      .withGuard('api')
      .loginAs(manager)
      .json({ role: 'owner' })
    promoteSelf.assertStatus(403)
    promoteSelf.assertBodyContains({ error: { code: 'OWNER_MANAGEMENT_REQUIRES_OWNER' } })

    const modifyOwner = await client
      .patch(`/api/companies/members/${ownerMembership.id}`)
      .withGuard('api')
      .loginAs(manager)
      .json({ status: 'suspended' })
    modifyOwner.assertStatus(403)

    const grantPayout = await client
      .patch(`/api/companies/members/${limitedMembership.id}`)
      .withGuard('api')
      .loginAs(manager)
      .json({ permissionOverrides: [{ permission: 'payout_settings.manage', effect: 'allow' }] })
    grantPayout.assertStatus(403)
    grantPayout.assertBodyContains({ error: { code: 'PAYOUT_PERMISSION_REQUIRES_OWNER' } })

    const exceedDelegation = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(limited)
      .json({ name: 'Too Powerful', email: 'power@example.com', role: 'manager' })
    exceedDelegation.assertStatus(403)
    exceedDelegation.assertBodyContains({ error: { code: 'PERMISSION_DELEGATION_EXCEEDED' } })

    const inviteOwner = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(manager)
      .json({ name: 'Owner', email: 'owner2@example.com', role: 'owner' })
    inviteOwner.assertStatus(403)
  })

  test('revocation removes only tokens scoped to the affected company', async ({
    client,
    assert,
  }) => {
    const first = await createApprovedCompany()
    const second = await createApprovedCompany()
    const employee = await UserFactory.apply('user', 'verified').create()
    const firstMembership = await CompanyMembership.create({
      companyId: first.company.id,
      userId: employee.id,
      role: 'viewer',
      status: 'active',
      joinedAt: first.company.createdAt,
    })
    await CompanyMembership.create({
      companyId: second.company.id,
      userId: employee.id,
      role: 'viewer',
      status: 'active',
      joinedAt: second.company.createdAt,
    })
    const firstToken = await User.accessTokens.create(employee, [
      'client:company_app',
      `company:${first.company.id}`,
    ])
    const secondToken = await User.accessTokens.create(employee, [
      'client:company_app',
      `company:${second.company.id}`,
    ])
    const customerToken = await User.accessTokens.create(employee, ['client:customer_app'])

    const response = await client
      .patch(`/api/companies/members/${firstMembership.id}`)
      .withGuard('api')
      .loginAs(first.owner)
      .json({ status: 'suspended' })
    response.assertStatus(200)
    const tokenRows = await db.from('auth_access_tokens').where('tokenable_id', employee.id)
    const ids = tokenRows.map((row) => row.id)
    assert.notInclude(ids, Number(firstToken.identifier))
    assert.include(ids, Number(secondToken.identifier))
    assert.include(ids, Number(customerToken.identifier))
  })

  test('customer and company tokens are rejected across app boundaries', async ({ client }) => {
    const { owner } = await createApprovedCompany()
    const customer = await UserFactory.apply('user', 'verified')
      .merge({ password: 'password123' })
      .create()
    const customerLogin = await client
      .post('/api/users/login')
      .json({ email: customer.email, password: 'password123' })
    const companyLogin = await client
      .post('/api/companies/login')
      .json({ email: owner.email, password: 'password123' })
    customerLogin.assertStatus(200)
    companyLogin.assertStatus(200)

    const customerToken = customerLogin.body().data.token.token
    const companyToken = companyLogin.body().data.token.token
    const companyRoute = await client
      .get('/api/companies/members')
      .header('Authorization', `Bearer ${customerToken}`)
    const customerRoute = await client
      .get('/api/users/me')
      .header('Authorization', `Bearer ${companyToken}`)
    companyRoute.assertStatus(403)
    customerRoute.assertStatus(403)
  })

  test('concurrent invitation acceptance creates at most one membership', async ({
    client,
    assert,
  }) => {
    const { owner, company } = await createApprovedCompany()
    const employee = await UserFactory.apply('user', 'verified').create()
    const invite = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(owner)
      .json({ name: 'Race', email: employee.email, role: 'viewer' })
    invite.assertStatus(201)
    const token = await deliveredInvitationToken()
    const service = new CompanyMembershipService()
    const results = await Promise.allSettled([
      service.accept(token, employee, {}),
      service.accept(token, employee, {}),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    const rejection = results.find((result) => result.status === 'rejected')
    assert.equal(rejection?.status, 'rejected')
    if (rejection?.status === 'rejected') assert.equal(rejection.reason.status, 409)
    const count = await CompanyMembership.query()
      .where('companyId', company.id)
      .where('userId', employee.id)
      .count('* as total')
    assert.equal(Number(count[0].$extras.total), 1)
  })
})
