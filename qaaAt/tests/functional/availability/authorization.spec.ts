import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import { createApprovedCompanyOwner, createCompanyMember } from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { createSpaceScenario } from '#tests/support/scenarios/spaces'

const policyInput = {
  mode: 'hourly' as const,
  slotIncrementMinutes: 60,
  minimumDurationMinutes: 60,
  maximumDurationMinutes: 240,
  minimumNoticeMinutes: 0,
  maximumAdvanceDays: 365,
  preparationBufferMinutes: 0,
  cleanupBufferMinutes: 0,
  operatingHours: [{ weekday: 3, opensAtLocal: '08:00', closesAtLocal: '18:00' }],
}

test.group('Availability policy authorization', (group) => {
  group.each.setup(withTruncateIsolation)

  test('viewers may read policy but cannot change it, and another tenant sees no Space', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const first = await createSpaceScenario()
    const second = await createApprovedCompanyOwner()
    const viewer = await createCompanyMember(first.company, 'viewer')
    const created = await client
      .visit('company_calendar.policy', { id: first.space.id })
      .withGuard('api')
      .loginAs(first.user, companyTokenAbilities(first.company))
      .json(policyInput)
    created.assertStatus(200)

    const readable = await client
      .visit('company_calendar.show_policy', { id: first.space.id })
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
    readable.assertStatus(200)
    readable.assertBodyContains({ data: { policy: { mode: 'hourly' } } })

    const denied = await client
      .visit('company_calendar.policy', { id: first.space.id })
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
      .json({ ...policyInput, maximumAdvanceDays: 30 })
    denied.assertStatus(403)
    denied.assertBodyContains({ error: { code: 'COMPANY_PERMISSION_REQUIRED' } })

    const hidden = await client
      .visit('company_calendar.show_policy', { id: first.space.id })
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
    hidden.assertStatus(404)
    const policy = await db
      .from('space_availability_policies')
      .where('space_id', first.space.id)
      .firstOrFail()
    assert.equal(policy.maximum_advance_days, 365)
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
