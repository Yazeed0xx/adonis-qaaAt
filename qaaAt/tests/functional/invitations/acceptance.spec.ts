import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import CompanyInvitation from '#models/company_invitation'
import CompanyMembership from '#models/company_membership'
import type { CompanyOwnerActor } from '#tests/support/actors'
import {
  createApprovedCompanyOwner,
  createCompanyMember,
  createCustomer,
} from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { withTruncateIsolation } from '#tests/support/database'
import { deliveredInvitationToken } from '#tests/support/invitations'

async function invite(
  client: ApiClient,
  owner: CompanyOwnerActor,
  input: { name: string; email: string; role?: 'viewer' | 'booking_staff' }
) {
  const response = await client
    .post('/api/companies/invitations')
    .withGuard('api')
    .loginAs(owner.user, companyTokenAbilities(owner.company))
    .json({ ...input, role: input.role ?? 'viewer' })
  response.assertStatus(201)
  const data = response.body().data
  if (Array.isArray(data)) throw new Error('Invitation creation returned a list')
  return {
    invitation: await CompanyInvitation.findOrFail(data.id),
    token: await deliveredInvitationToken(),
  }
}

test.group('Company invitation acceptance', (group) => {
  group.each.setup(withTruncateIsolation)

  test('existing user must authenticate, match the invited identity, and keeps the password', async ({
    client,
    db,
  }) => {
    const owner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const employee = await createCustomer({
      email: 'employee@example.com',
      password: 'original-password',
    })
    const attacker = await createCustomer({ email: 'attacker@example.com' })
    const { invitation, token } = await invite(client, owner, {
      name: 'Employee',
      email: employee.email,
      role: 'booking_staff',
    })

    const unauthenticated = await client.post('/api/company-invitations/accept').json({
      token,
      password: 'replacement-password',
    })
    unauthenticated.assertStatus(401)
    unauthenticated.assertBodyContains({ error: { code: 'INVITATION_AUTHENTICATION_REQUIRED' } })

    const mismatch = await client
      .post('/api/company-invitations/accept')
      .withGuard('api')
      .loginAs(attacker)
      .json({ token })
    mismatch.assertStatus(403)
    mismatch.assertBodyContains({ error: { code: 'INVITATION_IDENTITY_MISMATCH' } })
    db.assertMissing('company_memberships', {
      company_id: owner.company.id,
      user_id: attacker.id,
    })

    const accepted = await client
      .post('/api/company-invitations/accept')
      .withGuard('api')
      .loginAs(employee)
      .json({ token, password: 'replacement-password' })
    accepted.assertStatus(201)
    accepted.assertBodyContains({
      message: 'Invitation accepted successfully',
      data: {
        membership: { companyId: owner.company.id, role: 'booking_staff', status: 'active' },
        token: { type: 'bearer' },
      },
    })

    await User.verifyCredentials(employee.email, 'original-password')
    db.assertCount('users', 3)
    db.assertHas('company_memberships', {
      company_id: owner.company.id,
      user_id: employee.id,
      role: 'booking_staff',
      status: 'active',
    })
    db.assertHas('company_invitations', {
      id: invitation.id,
      status: 'accepted',
      accepted_by_user_id: employee.id,
    })
    db.assertHas('company_audit_logs', {
      action: 'invitation.accepted',
      actor_user_id: employee.id,
    })
  })

  test('new invitee creates exactly the invited identity and one membership', async ({
    client,
    db,
  }) => {
    const owner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const { token } = await invite(client, owner, {
      name: 'New Employee',
      email: 'new.employee@example.com',
    })

    const response = await client.post('/api/company-invitations/accept').json({
      token,
      name: 'New Employee',
      password: 'strong-password-123',
    })

    response.assertStatus(201)
    const user = await User.findByOrFail('email', 'new.employee@example.com')
    db.assertMissing('users', { email: 'attacker@example.com' })
    db.assertHas('company_memberships', {
      company_id: owner.company.id,
      user_id: user.id,
      role: 'viewer',
      status: 'active',
    })
    await User.verifyCredentials(user.email, 'strong-password-123')
  })

  test('rejects an invitation when the identity already has a current company', async ({
    client,
    db,
  }) => {
    const first = await createApprovedCompanyOwner({ user: { email: 'first-owner@example.com' } })
    const second = await createApprovedCompanyOwner({ user: { email: 'second-owner@example.com' } })
    const employee = await createCompanyMember(first.company, 'viewer', {
      email: 'already-employed@example.com',
    })

    const response = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
      .json({ name: 'Already Employed', email: employee.user.email, role: 'viewer' })

    response.assertStatus(409)
    response.assertBodyContains({ error: { code: 'COMPANY_MEMBERSHIP_LIMIT_REACHED' } })
    db.assertMissing('company_invitations', {
      company_id: second.company.id,
      invited_email: employee.user.email,
    })
  })

  test('inspection masks identity and never exposes invitation or company secrets', async ({
    client,
    assert,
  }) => {
    const owner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const { token } = await invite(client, owner, {
      name: 'Private Employee',
      email: 'private.employee@example.com',
    })

    const response = await client.get(`/api/company-invitations/inspect?token=${token}`)

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        name: 'Private Employee',
        role: 'viewer',
        invitedEmail: 'pr***@example.com',
        company: { id: owner.company.id, city: owner.company.city },
      },
    })
    const serialized = JSON.stringify(response.body())
    assert.notInclude(serialized, 'private.employee@example.com')
    assert.notInclude(serialized, token)
    assert.notInclude(serialized, 'tokenHash')
    assert.notInclude(serialized, 'registrationNumber')
    assert.notInclude(serialized, 'registrationNumberPdf')
  })

  test('expired, cancelled, and previously accepted invitations reject reuse', async ({
    client,
  }) => {
    const now = freezeTestTime()
    const owner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const expiredUser = await createCustomer({ email: 'expired@example.com' })
    const cancelledUser = await createCustomer({ email: 'cancelled@example.com' })
    const acceptedUser = await createCustomer({ email: 'accepted@example.com' })

    const expired = await invite(client, owner, {
      name: 'Expired',
      email: expiredUser.email,
    })
    expired.invitation.expiresAt = DateTime.fromJSDate(now).minus({ second: 1 })
    await expired.invitation.save()

    const cancelled = await invite(client, owner, {
      name: 'Cancelled',
      email: cancelledUser.email,
    })
    cancelled.invitation.status = 'cancelled'
    cancelled.invitation.cancelledAt = DateTime.fromJSDate(now)
    await cancelled.invitation.save()

    const accepted = await invite(client, owner, {
      name: 'Accepted',
      email: acceptedUser.email,
    })
    const firstAcceptance = await client
      .post('/api/company-invitations/accept')
      .withGuard('api')
      .loginAs(acceptedUser)
      .json({ token: accepted.token })
    firstAcceptance.assertStatus(201)

    const expiredResponse = await client
      .post('/api/company-invitations/accept')
      .withGuard('api')
      .loginAs(expiredUser)
      .json({ token: expired.token })
    expiredResponse.assertStatus(410)
    expiredResponse.assertBodyContains({ error: { code: 'INVITATION_EXPIRED' } })

    for (const terminal of [
      { user: cancelledUser, token: cancelled.token },
      { user: acceptedUser, token: accepted.token },
    ]) {
      const response = await client
        .post('/api/company-invitations/accept')
        .withGuard('api')
        .loginAs(terminal.user)
        .json({ token: terminal.token })
      response.assertStatus(409)
      response.assertBodyContains({ error: { code: 'INVITATION_NOT_PENDING' } })
    }
  })

  test('concurrent HTTP acceptance has one winner and one durable membership', async ({
    client,
    assert,
    db,
  }) => {
    const owner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const employee = await createCustomer({ email: 'race.employee@example.com' })
    const { invitation, token } = await invite(client, owner, {
      name: 'Race Employee',
      email: employee.email,
    })

    const responses = await Promise.all([
      client
        .post('/api/company-invitations/accept')
        .withGuard('api')
        .loginAs(employee)
        .json({ token }),
      client
        .post('/api/company-invitations/accept')
        .withGuard('api')
        .loginAs(employee)
        .json({ token }),
    ])
    const statuses = responses
      .map((response) => response.status())
      .sort((left, right) => left - right)

    assert.deepEqual(statuses, [201, 409])
    const loser = responses.find((response) => response.status() === 409)
    assert.deepEqual(loser?.body(), {
      error: {
        code: 'INVITATION_NOT_PENDING',
        message: 'Invitation is no longer pending',
      },
    })
    assert.equal(
      await CompanyMembership.query()
        .where('companyId', owner.company.id)
        .where('userId', employee.id)
        .count('* as total')
        .then((rows) => Number(rows[0].$extras.total)),
      1
    )
    assert.equal(
      await CompanyInvitation.query()
        .where('id', invitation.id)
        .where('status', 'accepted')
        .count('* as total')
        .then((rows) => Number(rows[0].$extras.total)),
      1
    )
    db.assertHas('company_audit_logs', {
      company_id: owner.company.id,
      action: 'invitation.accepted',
      actor_user_id: employee.id,
    })
  }).timeout(10_000)
})
import { companyTokenAbilities } from '#tests/support/company_auth'
