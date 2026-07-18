import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { freezeTestTime } from '#tests/support/clock'
import {
  createSpaceFixture,
  createSpaceScenario,
  publishSpace,
} from '#tests/support/scenarios/spaces'

test.group('Public Space availability discovery', (group) => {
  group.each.setup(withTruncateIsolation)

  test('an availability range returns only Spaces with an authoritative available slot', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createSpaceScenario({
      space: publishSpace({ nameEn: 'Available room' }),
    })
    const unavailable = await createSpaceFixture(
      scenario,
      scenario.venue,
      scenario.category,
      publishSpace({ nameEn: 'Unavailable room' })
    )
    const day = DateTime.fromISO('2026-06-17T00:00:00', { zone: 'Asia/Riyadh' })
    await db.table('space_availability_policies').insert({
      company_id: scenario.company.id,
      space_id: scenario.space.id,
      mode: 'full_day',
      slot_increment_minutes: 60,
      minimum_duration_minutes: 60,
      maximum_duration_minutes: 1440,
      minimum_notice_minutes: 0,
      maximum_advance_days: 365,
      preparation_buffer_minutes: 0,
      cleanup_buffer_minutes: 0,
      is_active: true,
    })
    await db.table('space_operating_hours').insert({
      company_id: scenario.company.id,
      space_id: scenario.space.id,
      weekday: day.weekday % 7,
      opens_at_local: '08:00',
      closes_at_local: '18:00',
      ends_next_day: false,
      sort_order: 0,
    })

    const response = await client.visit('public_spaces.index').qs({
      from: day.toISO()!,
      to: day.plus({ days: 1 }).toISO()!,
      page: 1,
      limit: 10,
    })
    response.assertStatus(200)
    response.assertBodyContains({
      data: [{ id: scenario.space.id, name: 'Available room' }],
      meta: { page: 1, limit: 10, hasNextPage: false },
    })
    assert.notInclude(
      response.body().data.map((space) => space.id),
      unavailable.id
    )
  })
})
