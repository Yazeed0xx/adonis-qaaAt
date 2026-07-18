import { test } from '@japa/runner'
import { createApprovedCompanyOwner, createCompanyMember } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'

test.group('Company member access', (group) => {
  group.each.setup(withTruncateIsolation)

  test('members.view lists only active tenant members without leaking another company', async ({
    client,
    assert,
  }) => {
    const first = await createApprovedCompanyOwner({ user: { email: 'first-owner@example.com' } })
    const firstViewer = await createCompanyMember(first.company, 'viewer', {
      email: 'first-viewer@example.com',
    })
    const second = await createApprovedCompanyOwner({ user: { email: 'second-owner@example.com' } })
    await createCompanyMember(second.company, 'viewer', { email: 'second-viewer@example.com' })

    const response = await client
      .get('/api/companies/members')
      .withGuard('api')
      .loginAs(first.user, companyTokenAbilities(first.company))

    response.assertStatus(200)
    assert.deepEqual(
      response
        .body()
        .data.map((member: { id: number }) => member.id)
        .sort((left: number, right: number) => left - right),
      [first.membership.id, firstViewer.membership.id].sort((left, right) => left - right)
    )
    assert.notInclude(JSON.stringify(response.body()), 'second-viewer@example.com')
  })

  test('a member without members.view cannot list members', async ({ client }) => {
    const { company } = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const staff = await createCompanyMember(company, 'booking_staff', {
      email: 'staff@example.com',
    })

    const response = await client
      .get('/api/companies/members')
      .withGuard('api')
      .loginAs(staff.user, companyTokenAbilities(staff.membership.companyId))

    response.assertStatus(403)
    response.assertBodyContains({ error: { code: 'COMPANY_PERMISSION_REQUIRED' } })
  })

  test('an unauthenticated request cannot enumerate company members', async ({ client }) => {
    const response = await client.get('/api/companies/members')

    response.assertStatus(401)
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
