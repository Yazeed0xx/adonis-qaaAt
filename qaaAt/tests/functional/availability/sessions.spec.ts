import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import { freezeTestTime } from '#tests/support/clock'
import { responseId, responseItems } from '#tests/support/responses'
import { createAvailabilityScenario } from '#tests/support/scenarios/availability'

test.group('Availability session HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('an owner creates, updates, lists, and deletes a named session', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, membership, space } = await createAvailabilityScenario()
    const created = await client
      .visit('company_calendar.create_session', { id: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .json({
        code: 'morning',
        name: { en: 'Morning' },
        weekday: 1,
        startsAtLocal: '08:00',
        endsAtLocal: '12:00',
      })
    created.assertStatus(201)
    const sessionId = responseId(created.body())

    const updated = await client
      .visit('company_calendar.update_session', { id: space.id, sessionId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .json({
        code: 'morning',
        name: { ar: 'الصباح', en: 'Morning' },
        weekday: 1,
        startsAtLocal: '09:00',
        endsAtLocal: '13:00',
      })
    updated.assertStatus(200)
    const listed = await client
      .visit('company_calendar.list_sessions', { id: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
    listed.assertStatus(200)
    const sessions = responseItems(listed.body())
    assert.lengthOf(sessions, 1)
    assert.equal(sessions[0].id, sessionId)
    assert.equal(sessions[0].name_ar, 'الصباح')
    assert.equal(sessions[0].starts_at_local, '09:00:00')

    const removed = await client
      .visit('company_calendar.destroy_session', { id: space.id, sessionId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
    removed.assertStatus(204)
  })

  test('overlapping sessions are rejected without creating a second row', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, membership, space } = await createAvailabilityScenario()
    await client
      .visit('company_calendar.create_session', { id: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .json({
        code: 'morning',
        name: { en: 'Morning' },
        weekday: 1,
        startsAtLocal: '08:00',
        endsAtLocal: '12:00',
      })
    const overlap = await client
      .visit('company_calendar.create_session', { id: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .json({
        code: 'overlap',
        name: { en: 'Overlap' },
        weekday: 1,
        startsAtLocal: '11:00',
        endsAtLocal: '13:00',
      })
    overlap.assertStatus(422)
    overlap.assertBodyContains({ error: { code: 'CALENDAR_WINDOWS_OVERLAP' } })
    const listed = await client
      .visit('company_calendar.list_sessions', { id: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
    assert.lengthOf(responseItems(listed.body()), 1)
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
