import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import { DateTime } from 'luxon'
import { freezeTestTime } from '#tests/support/clock'
import { createSpaceScenario, publishSpace } from '#tests/support/scenarios/spaces'

test.group('Public availability HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('a published Space returns venue-local slots as unambiguous UTC instants', async ({
    client,
  }) => {
    freezeTestTime()
    const { user, company, space } = await createSpaceScenario({ space: publishSpace() })
    const day = DateTime.fromISO('2026-07-01T00:00:00', { zone: 'Asia/Riyadh' })
    const policy = await client
      .visit('company_calendar.policy', { id: space.id })
      .withGuard('api')
      .loginAs(user, companyTokenAbilities(company))
      .json({
        mode: 'full_day',
        slotIncrementMinutes: 60,
        minimumDurationMinutes: 600,
        maximumDurationMinutes: 600,
        minimumNoticeMinutes: 0,
        maximumAdvanceDays: 365,
        preparationBufferMinutes: 0,
        cleanupBufferMinutes: 0,
        operatingHours: [
          { weekday: day.weekday % 7, opensAtLocal: '08:00', closesAtLocal: '18:00' },
        ],
      })
    policy.assertStatus(200)

    const response = await client.visit('public_availability.show', { id: space.id }).qs({
      from: day.toISO()!,
      to: day.plus({ day: 1 }).toISO()!,
    })
    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        spaceId: space.id,
        timezone: 'Asia/Riyadh',
        mode: 'full_day',
        slots: [
          {
            startAt: '2026-07-01T05:00:00.000Z',
            endAt: '2026-07-01T15:00:00.000Z',
          },
        ],
      },
    })
  })

  test('public availability hides drafts and rejects ambiguous or excessive ranges', async ({
    client,
  }) => {
    freezeTestTime()
    const { space } = await createSpaceScenario()

    const hidden = await client.visit('public_availability.show', { id: space.id }).qs({
      from: '2026-07-01T00:00:00+03:00',
      to: '2026-07-02T00:00:00+03:00',
    })
    hidden.assertStatus(404)
    hidden.assertBodyContains({ error: { code: 'SPACE_NOT_FOUND' } })

    await space.merge(publishSpace()).save()
    const ambiguous = await client.visit('public_availability.show', { id: space.id }).qs({
      from: '2026-07-01T00:00:00',
      to: '2026-07-02T00:00:00',
    })
    ambiguous.assertStatus(422)
    ambiguous.assertBodyContains({ error: { code: 'AVAILABILITY_RANGE_INVALID' } })

    const excessive = await client.visit('public_availability.show', { id: space.id }).qs({
      from: '2026-07-01T00:00:00+03:00',
      to: '2026-08-02T00:00:00+03:00',
    })
    excessive.assertStatus(422)
    excessive.assertBodyContains({ error: { code: 'AVAILABILITY_RANGE_LIMIT' } })
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
