import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import { DateTime } from 'luxon'
import { freezeTestTime } from '#tests/support/clock'
import { createAvailabilityScenario } from '#tests/support/scenarios/availability'

test.group('Availability policy HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('policy rejects overlapping hours with a stable domain error', async ({ client }) => {
    freezeTestTime()
    const { owner, membership, space } = await createAvailabilityScenario()
    const policy = await client
      .visit('company_calendar.show_policy', { id: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
    policy.assertStatus(200)

    const overlapping = await client
      .visit('company_calendar.policy', { id: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .json({
        mode: 'hourly',
        slotIncrementMinutes: 60,
        minimumDurationMinutes: 60,
        maximumDurationMinutes: 240,
        minimumNoticeMinutes: 0,
        maximumAdvanceDays: 365,
        preparationBufferMinutes: 0,
        cleanupBufferMinutes: 0,
        operatingHours: [
          { weekday: 1, opensAtLocal: '08:00', closesAtLocal: '12:00' },
          { weekday: 1, opensAtLocal: '11:00', closesAtLocal: '14:00' },
        ],
      })
    overlapping.assertStatus(422)
    overlapping.assertBodyContains({ error: { code: 'CALENDAR_WINDOWS_OVERLAP' } })
  })

  test('company calendar rejects a range beyond its documented limit', async ({ client }) => {
    freezeTestTime()
    const { owner, membership } = await createAvailabilityScenario()
    const from = DateTime.now().toUTC()
    const response = await client
      .visit('company_calendar.index')
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .qs({ from: from.toISO()!, to: from.plus({ days: 94 }).toISO()! })
    response.assertStatus(422)
    response.assertBodyContains({ error: { code: 'CALENDAR_RANGE_LIMIT' } })
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
