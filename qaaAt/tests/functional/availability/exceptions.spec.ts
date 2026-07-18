import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { freezeTestTime } from '#tests/support/clock'
import { responseId, responseItems } from '#tests/support/responses'
import { createAvailabilityScenario } from '#tests/support/scenarios/availability'

test.group('Availability exception HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('a closed day removes candidates without manufacturing inventory', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, membership, space } = await createAvailabilityScenario()
    const date = DateTime.now().plus({ days: 5 }).setZone('Asia/Riyadh').startOf('day')
    const created = await client
      .visit('company_calendar.exception', { id: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .json({
        localDate: date.toFormat('yyyy-MM-dd'),
        kind: 'closed',
        reason: 'Configured closed day',
      })
    created.assertStatus(201)
    const blocks = await db.from('space_inventory_blocks')
    assert.lengthOf(blocks, 0)

    const result = await client.get(`/api/spaces/${space.id}/availability`).qs({
      from: date.toUTC().toISO()!,
      to: date.endOf('day').toUTC().toISO()!,
    })
    result.assertStatus(200)
    result.assertBodyContains({ data: { slots: [] } })
  })

  test('an owner manages one modified-hours exception and overlap rolls back', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, membership, space } = await createAvailabilityScenario()
    const created = await client
      .visit('company_calendar.exception', { id: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .json({
        localDate: '2030-01-02',
        kind: 'modified_hours',
        startsAtLocal: '10:00',
        endsAtLocal: '14:00',
      })
    created.assertStatus(201)
    const exceptionId = responseId(created.body())

    const overlap = await client
      .visit('company_calendar.exception', { id: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .json({
        localDate: '2030-01-02',
        kind: 'open_override',
        startsAtLocal: '13:00',
        endsAtLocal: '16:00',
      })
    overlap.assertStatus(422)
    overlap.assertBodyContains({ error: { code: 'CALENDAR_WINDOWS_OVERLAP' } })

    const updated = await client
      .visit('company_calendar.update_exception', { id: space.id, exceptionId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .json({
        localDate: '2030-01-02',
        kind: 'modified_hours',
        startsAtLocal: '09:00',
        endsAtLocal: '15:00',
      })
    updated.assertStatus(200)
    const listed = await client
      .visit('company_calendar.list_exceptions', { id: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
    assert.lengthOf(responseItems(listed.body()), 1)

    const removed = await client
      .visit('company_calendar.destroy_exception', { id: space.id, exceptionId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
    removed.assertStatus(204)
  })

  test('invalid and incomplete modified hours return stable validation errors', async ({
    client,
  }) => {
    freezeTestTime()
    const { owner, membership, space } = await createAvailabilityScenario()
    const invalidTime = await client
      .visit('company_calendar.exception', { id: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .json({
        localDate: '2030-01-01',
        kind: 'modified_hours',
        startsAtLocal: '99:99',
        endsAtLocal: '12:00',
      })
    invalidTime.assertStatus(422)
    invalidTime.assertBodyContains({ error: { code: 'VALIDATION_ERROR' } })

    const missingWindow = await client
      .visit('company_calendar.exception', { id: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .json({ localDate: '2030-01-01', kind: 'modified_hours' })
    missingWindow.assertStatus(422)
    missingWindow.assertBodyContains({ error: { code: 'EXCEPTION_FIELDS_REQUIRED' } })
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
