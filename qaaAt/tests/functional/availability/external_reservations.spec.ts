import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { createApprovedCompanyOwner, createCompanyMember } from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { responseId, responseItems } from '#tests/support/responses'
import { createSpaceScenario } from '#tests/support/scenarios/spaces'

const reservationInput = (spaceId: number) => ({
  spaceId,
  type: 'maintenance' as const,
  startsAt: '2026-07-01T10:00:00+03:00',
  endsAt: '2026-07-01T12:00:00+03:00',
  timezone: 'Asia/Riyadh',
  preparationBufferMinutes: 30,
  cleanupBufferMinutes: 45,
  internalNote: 'Quarterly maintenance',
})

test.group('External reservation HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('an owner creates, reschedules, lists, and releases a source-backed inventory block', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { user, company, space } = await createSpaceScenario()

    const created = await client
      .visit('company_calendar.external')
      .withGuard('api')
      .loginAs(user, companyTokenAbilities(space.companyId))
      .json(reservationInput(space.id))
    created.assertStatus(201)
    const reservationId = responseId(created.body())

    const createdBlock = await db
      .from('space_inventory_blocks')
      .where('external_reservation_id', reservationId)
      .firstOrFail()
    assert.equal(createdBlock.company_id, company.id)
    assert.equal(createdBlock.status, 'active')
    assert.equal(new Date(createdBlock.starts_at).toISOString(), '2026-07-01T07:00:00.000Z')
    assert.equal(new Date(createdBlock.ends_at).toISOString(), '2026-07-01T09:00:00.000Z')
    assert.equal(new Date(createdBlock.blocked_from_at).toISOString(), '2026-07-01T06:30:00.000Z')
    assert.equal(new Date(createdBlock.blocked_until_at).toISOString(), '2026-07-01T09:45:00.000Z')

    const feed = await client
      .visit('company_calendar.index')
      .withGuard('api')
      .loginAs(user, companyTokenAbilities(space.companyId))
      .qs({ from: '2026-07-01T00:00:00+03:00', to: '2026-07-02T00:00:00+03:00' })
    feed.assertStatus(200)
    assert.deepEqual(
      responseItems(feed.body()).map((item) => item.id),
      [reservationId]
    )

    const updated = await client
      .visit('company_calendar.update_external', { id: reservationId })
      .withGuard('api')
      .loginAs(user, companyTokenAbilities(space.companyId))
      .json({
        ...reservationInput(space.id),
        startsAt: '2026-07-01T13:00:00+03:00',
        endsAt: '2026-07-01T15:00:00+03:00',
        preparationBufferMinutes: 0,
        cleanupBufferMinutes: 0,
      })
    updated.assertStatus(200)
    const movedBlock = await db
      .from('space_inventory_blocks')
      .where('external_reservation_id', reservationId)
      .firstOrFail()
    assert.equal(new Date(movedBlock.blocked_from_at).toISOString(), '2026-07-01T10:00:00.000Z')
    assert.equal(new Date(movedBlock.blocked_until_at).toISOString(), '2026-07-01T12:00:00.000Z')

    const released = await client
      .visit('company_calendar.destroy_external', { id: reservationId })
      .withGuard('api')
      .loginAs(user, companyTokenAbilities(space.companyId))
    released.assertStatus(200)
    const source = await db.from('external_reservations').where('id', reservationId).firstOrFail()
    const block = await db
      .from('space_inventory_blocks')
      .where('external_reservation_id', reservationId)
      .firstOrFail()
    assert.equal(source.status, 'cancelled')
    assert.equal(block.status, 'released')
    assert.equal(block.release_reason, 'cancelled')
  })

  test('calendar management denies viewers and hides another tenant without changing state', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const first = await createSpaceScenario()
    const second = await createApprovedCompanyOwner()
    const viewer = await createCompanyMember(first.company, 'viewer')

    const denied = await client
      .visit('company_calendar.external')
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
      .json(reservationInput(first.space.id))
    denied.assertStatus(403)
    denied.assertBodyContains({ error: { code: 'COMPANY_PERMISSION_REQUIRED' } })

    const hidden = await client
      .visit('company_calendar.external')
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
      .json(reservationInput(first.space.id))
    hidden.assertStatus(404)

    const deniedCount = await db.from('external_reservations').count('* as total').firstOrFail()
    assert.equal(Number(deniedCount.total), 0)

    const created = await client
      .visit('company_calendar.external')
      .withGuard('api')
      .loginAs(first.user, companyTokenAbilities(first.company))
      .json(reservationInput(first.space.id))
    created.assertStatus(201)
    const reservationId = responseId(created.body())
    const deniedUpdate = await client
      .visit('company_calendar.update_external', { id: reservationId })
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
      .json({ ...reservationInput(first.space.id), internalNote: 'Unauthorized change' })
    deniedUpdate.assertStatus(403)
    const hiddenDelete = await client
      .visit('company_calendar.destroy_external', { id: reservationId })
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
    hiddenDelete.assertStatus(404)

    const unchanged = await db
      .from('external_reservations')
      .where('id', reservationId)
      .firstOrFail()
    assert.equal(unchanged.status, 'active')
    assert.equal(unchanged.internal_note, 'Quarterly maintenance')
  })

  test('external holds and calendar instants reject ambiguous, mismatched, and expired input', async ({
    client,
  }) => {
    freezeTestTime()
    const { user, space } = await createSpaceScenario()

    const missingExpiry = await client
      .visit('company_calendar.external')
      .withGuard('api')
      .loginAs(user, companyTokenAbilities(space.companyId))
      .json({ ...reservationInput(space.id), type: 'external_hold' })
    missingExpiry.assertStatus(422)
    missingExpiry.assertBodyContains({ error: { code: 'EXTERNAL_HOLD_EXPIRY_REQUIRED' } })

    const expired = await client
      .visit('company_calendar.external')
      .withGuard('api')
      .loginAs(user, companyTokenAbilities(space.companyId))
      .json({
        ...reservationInput(space.id),
        type: 'external_hold',
        expiresAt: DateTime.now().minus({ minute: 1 }).toISO(),
      })
    expired.assertStatus(422)
    expired.assertBodyContains({ error: { code: 'EXTERNAL_HOLD_EXPIRY_INVALID' } })

    const mismatchedZone = await client
      .visit('company_calendar.external')
      .withGuard('api')
      .loginAs(user, companyTokenAbilities(space.companyId))
      .json({ ...reservationInput(space.id), timezone: 'UTC' })
    mismatchedZone.assertStatus(422)
    mismatchedZone.assertBodyContains({ error: { code: 'CALENDAR_TIMEZONE_MISMATCH' } })

    const ambiguous = await client
      .visit('company_calendar.external')
      .withGuard('api')
      .loginAs(user, companyTokenAbilities(space.companyId))
      .json({ ...reservationInput(space.id), startsAt: '2026-07-01T10:00:00' })
    ambiguous.assertStatus(422)
    ambiguous.assertBodyContains({ error: { code: 'CALENDAR_INSTANT_AMBIGUOUS' } })
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
