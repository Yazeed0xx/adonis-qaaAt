import { test } from '@japa/runner'
import CompanyInvitation from '#models/company_invitation'
import { createApprovedCompanyOwner, createCompanyMember } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'
import { deliveredInvitationToken } from '#tests/support/invitations'

test.group('Company invitation management', (group) => {
  group.each.setup(withTruncateIsolation)

  test('owner creates, lists, resends, and cancels an invitation without exposing secrets', async ({
    client,
    assert,
    db,
  }) => {
    const owner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const created = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(owner.user, companyTokenAbilities(owner.company))
      .json({ name: 'Employee', email: 'employee@example.com', role: 'viewer' })
    created.assertStatus(201)
    created.assertBodyContains({
      message: 'Invitation created successfully',
      data: {
        name: 'Employee',
        invitedEmail: 'employee@example.com',
        role: 'viewer',
        status: 'pending',
      },
    })
    const createdData = created.body().data
    if (Array.isArray(createdData)) throw new Error('Invitation creation returned a list')
    const invitationId = createdData.id
    const firstToken = await deliveredInvitationToken()

    const listed = await client
      .get('/api/companies/invitations')
      .withGuard('api')
      .loginAs(owner.user, companyTokenAbilities(owner.company))
    listed.assertStatus(200)
    const listedData = listed.body().data
    if (!Array.isArray(listedData)) throw new Error('Invitation listing returned one item')
    assert.deepEqual(
      listedData.map((invitation) => invitation.id),
      [invitationId]
    )

    const resent = await client
      .post(`/api/companies/invitations/${invitationId}/resend`)
      .withGuard('api')
      .loginAs(owner.user, companyTokenAbilities(owner.company))
    resent.assertStatus(200)
    const secondToken = await deliveredInvitationToken()
    assert.notEqual(secondToken, firstToken)

    for (const response of [created, listed, resent]) {
      const serialized = JSON.stringify(response.body())
      assert.notInclude(serialized, firstToken)
      assert.notInclude(serialized, secondToken)
      assert.notInclude(serialized, 'tokenHash')
      assert.notInclude(serialized, 'acceptanceToken')
    }

    const cancelled = await client
      .delete(`/api/companies/invitations/${invitationId}`)
      .withGuard('api')
      .loginAs(owner.user, companyTokenAbilities(owner.company))
    cancelled.assertStatus(204)
    db.assertHas('company_invitations', { id: invitationId, status: 'cancelled' })
    db.assertCount('company_audit_logs', 3)
    db.assertHas('company_audit_logs', { action: 'invitation.created', target_id: invitationId })
    db.assertHas('company_audit_logs', { action: 'invitation.resent', target_id: invitationId })
    db.assertHas('company_audit_logs', { action: 'invitation.cancelled', target_id: invitationId })
  })

  test('company A cannot read, resend, or cancel company B invitations', async ({
    client,
    assert,
    db,
  }) => {
    const first = await createApprovedCompanyOwner({ user: { email: 'first@example.com' } })
    const second = await createApprovedCompanyOwner({ user: { email: 'second@example.com' } })
    const created = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(first.user, companyTokenAbilities(first.company))
      .json({ name: 'Private', email: 'private@example.com', role: 'viewer' })
    const createdData = created.body().data
    if (Array.isArray(createdData)) throw new Error('Invitation creation returned a list')
    const invitationId = createdData.id

    const secondList = await client
      .get('/api/companies/invitations')
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
    secondList.assertStatus(200)
    assert.deepEqual(secondList.body().data, [])

    const resend = await client
      .post(`/api/companies/invitations/${invitationId}/resend`)
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
    resend.assertStatus(404)
    const cancel = await client
      .delete(`/api/companies/invitations/${invitationId}`)
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
    cancel.assertStatus(404)

    db.assertHas('company_invitations', {
      id: invitationId,
      company_id: first.company.id,
      status: 'pending',
    })
    db.assertCount('company_audit_logs', 1)
  })

  test('members without members.manage cannot create, resend, or cancel invitations', async ({
    client,
    db,
  }) => {
    const owner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const viewer = await createCompanyMember(owner.company, 'viewer', {
      email: 'viewer@example.com',
    })
    const created = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(owner.user, companyTokenAbilities(owner.company))
      .json({ name: 'Employee', email: 'employee@example.com', role: 'viewer' })
    const createdData = created.body().data
    if (Array.isArray(createdData)) throw new Error('Invitation creation returned a list')
    const invitationId = createdData.id

    const createDenied = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
      .json({ name: 'Blocked', email: 'blocked@example.com', role: 'viewer' })
    createDenied.assertStatus(403)
    createDenied.assertBodyContains({ error: { code: 'COMPANY_PERMISSION_REQUIRED' } })
    const resendDenied = await client
      .post(`/api/companies/invitations/${invitationId}/resend`)
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
    resendDenied.assertStatus(403)
    const cancelDenied = await client
      .delete(`/api/companies/invitations/${invitationId}`)
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
    cancelDenied.assertStatus(403)

    db.assertHas('company_invitations', { id: invitationId, status: 'pending' })
    db.assertMissing('company_invitations', { invited_email: 'blocked@example.com' })
  })

  test('creation requires an approved company and a validated email identity', async ({
    client,
    db,
  }) => {
    const pending = await createApprovedCompanyOwner({ user: { email: 'pending@example.com' } })
    pending.company.status = 'pending'
    pending.company.approvedAt = null
    await pending.company.save()
    const pendingResponse = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(pending.user, companyTokenAbilities(pending.company))
      .json({ name: 'Employee', email: 'employee@example.com', role: 'viewer' })
    pendingResponse.assertStatus(403)
    pendingResponse.assertBodyContains({ error: { code: 'COMPANY_PENDING_APPROVAL' } })

    const approved = await createApprovedCompanyOwner({ user: { email: 'approved@example.com' } })
    const phoneOnly = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(approved.user, companyTokenAbilities(approved.company))
      .json({ name: 'Phone Only', phone: '+966500000000', role: 'viewer' })
    phoneOnly.assertStatus(422)
    phoneOnly.assertBodyContains({ error: { code: 'VALIDATION_ERROR' } })
    db.assertEmpty('company_invitations')
  })

  test('duplicate pending invitations for the normalized email are rejected', async ({
    client,
    db,
  }) => {
    const owner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const first = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(owner.user, companyTokenAbilities(owner.company))
      .json({ name: 'First', email: 'Employee@Example.com', role: 'viewer' })
    first.assertStatus(201)

    const duplicate = await client
      .post('/api/companies/invitations')
      .withGuard('api')
      .loginAs(owner.user, companyTokenAbilities(owner.company))
      .json({ name: 'Second', email: 'employee@example.com', role: 'manager' })
    duplicate.assertStatus(409)
    duplicate.assertBodyContains({ error: { code: 'INVITATION_ALREADY_PENDING' } })
    db.assertCount('company_invitations', 1)
    const invitation = await CompanyInvitation.firstOrFail()
    if (invitation.invitedEmail !== 'employee@example.com') {
      throw new Error('Invitation email was not normalized')
    }
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
