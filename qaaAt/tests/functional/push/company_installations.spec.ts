import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { createApprovedCompanyOwner, createCompanyMember } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'
import { COMPANY_PUSH_TOKEN } from '#tests/support/scenarios/notifications'

test.group('Company push installation HTTP contract', (group) => {
  group.each.setup(withTruncateIsolation)

  test('registers an active employee installation in the company app context', async ({
    client,
    assert,
  }) => {
    const owner = await createApprovedCompanyOwner()
    const employee = await createCompanyMember(owner.company, 'viewer', {
      email: 'company.push.employee@example.com',
    })
    const response = await client
      .visit('push_installations.store')
      .withGuard('api')
      .loginAs(employee.user, companyTokenAbilities(employee.membership.companyId))
      .json({
        installationId: 'company-employee-installation-0001',
        expoPushToken: COMPANY_PUSH_TOKEN,
        platform: 'android',
      })

    response.assertStatus(200)
    assert.notInclude(JSON.stringify(response.body()), 'expoPushToken')
    const row = await db.from('push_installations').firstOrFail()
    assert.equal(row.user_id, employee.user.id)
    assert.equal(row.client_context, 'company_app')
  })

  test('moves an installation atomically and scopes revocation to its current owner', async ({
    client,
    assert,
  }) => {
    const first = await createApprovedCompanyOwner()
    const second = await createApprovedCompanyOwner()
    const installationId = 'shared-company-installation-0001'
    const payload = { installationId, expoPushToken: COMPANY_PUSH_TOKEN, platform: 'ios' as const }

    await client
      .visit('push_installations.store')
      .withGuard('api')
      .loginAs(first.user, companyTokenAbilities(first.company))
      .json(payload)
    await client
      .visit('push_installations.store')
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
      .json({ ...payload, platform: 'android' })

    const moved = await db.from('push_installations').firstOrFail()
    assert.equal(moved.user_id, second.user.id)

    const foreignRevoke = await client
      .visit('push_installations.destroy', { installationId })
      .withGuard('api')
      .loginAs(first.user, companyTokenAbilities(first.company))
    foreignRevoke.assertStatus(204)
    const afterForeignRevoke = await db.from('push_installations').firstOrFail()
    assert.isNull(afterForeignRevoke.revoked_at)

    const ownerRevoke = await client
      .visit('push_installations.destroy', { installationId })
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
    ownerRevoke.assertStatus(204)
    const afterOwnerRevoke = await db.from('push_installations').firstOrFail()
    assert.isNotNull(afterOwnerRevoke.revoked_at)
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
