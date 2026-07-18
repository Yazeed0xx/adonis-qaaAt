import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import InventoryException from '#exceptions/inventory_exception'
import calendar from '#services/company_calendar_service'
import { createAvailabilityScenario as setupCompanyHall } from '#tests/support/scenarios/availability'
import { withTruncateIsolation } from '#tests/support/database'
import { freezeTestTime } from '#tests/support/clock'

test.group('External reservation invariants', (group) => {
  group.each.setup(withTruncateIsolation)

  test('external hold expires and releases its source-backed block', async ({ assert }) => {
    freezeTestTime()
    const { owner, company, space } = await setupCompanyHall()
    const start = DateTime.now().plus({ days: 4 }).startOf('hour')
    const source = await calendar.createExternal(company.id, owner.id, {
      spaceId: space.id,
      type: 'external_hold',
      startsAt: start.toISO(),
      endsAt: start.plus({ hours: 2 }).toISO(),
      timezone: 'Asia/Riyadh',
      expiresAt: DateTime.now().plus({ hour: 1 }).toISO(),
    })
    await db
      .from('external_reservations')
      .where('id', source.id)
      .update({ expires_at: DateTime.now().minus({ minute: 1 }).toSQL() })
    assert.equal(await calendar.expireExternalHolds(), 1)
    const expiredSource = await db
      .from('external_reservations')
      .where('id', source.id)
      .firstOrFail()
    const releasedBlock = await db
      .from('space_inventory_blocks')
      .where('external_reservation_id', source.id)
      .firstOrFail()
    assert.equal(expiredSource.status, 'expired')
    assert.equal(releasedBlock.status, 'released')
  })

  test('simultaneous overlapping reservations produce exactly one durable winner', async ({
    assert,
  }) => {
    freezeTestTime()
    const { owner, company, space } = await setupCompanyHall()
    const start = DateTime.now().plus({ days: 4 }).startOf('hour')
    const input = {
      spaceId: space.id,
      type: 'maintenance',
      startsAt: start.toISO(),
      endsAt: start.plus({ hours: 2 }).toISO(),
      timezone: 'Asia/Riyadh',
    }

    const attempts = await Promise.allSettled([
      calendar.createExternal(company.id, owner.id, input),
      calendar.createExternal(company.id, owner.id, input),
    ])
    const winners = attempts.filter((attempt) => attempt.status === 'fulfilled')
    const losers = attempts.filter((attempt) => attempt.status === 'rejected')
    assert.lengthOf(winners, 1)
    assert.lengthOf(losers, 1)
    assert.instanceOf(losers[0].reason, InventoryException)
    assert.equal(losers[0].reason.code, 'INVENTORY_OVERLAP')

    const sources = await db.from('external_reservations').where('status', 'active')
    const blocks = await db.from('space_inventory_blocks').where('status', 'active')
    const events = await db
      .from('space_inventory_events')
      .where('action', 'external_reservation.created')
    assert.lengthOf(sources, 1)
    assert.lengthOf(blocks, 1)
    assert.lengthOf(events, 1)
    assert.equal(blocks[0].external_reservation_id, sources[0].id)
  })

  test('concurrent external-hold workers claim each expired hold once', async ({ assert }) => {
    freezeTestTime()
    const { owner, company, space } = await setupCompanyHall()
    const start = DateTime.now().plus({ days: 4 }).startOf('hour')
    const source = await calendar.createExternal(company.id, owner.id, {
      spaceId: space.id,
      type: 'external_hold',
      startsAt: start.toISO(),
      endsAt: start.plus({ hours: 2 }).toISO(),
      timezone: 'Asia/Riyadh',
      expiresAt: DateTime.now().plus({ hour: 1 }).toISO(),
    })
    await db
      .from('external_reservations')
      .where('id', source.id)
      .update({ expires_at: DateTime.now().minus({ minute: 1 }).toSQL() })
    const counts = await Promise.all([
      calendar.expireExternalHolds(),
      calendar.expireExternalHolds(),
    ])
    assert.equal(
      counts.reduce((total, value) => total + value, 0),
      1
    )
    const eventCount = await db
      .from('space_inventory_events')
      .where('action', 'external_reservation.expired')
      .count('* as total')
      .firstOrFail()
    assert.equal(Number(eventCount.total), 1)
  })

  test('external holds require a future expiry', async ({ assert }) => {
    freezeTestTime()
    const { owner, company, space } = await setupCompanyHall()
    const start = DateTime.now().plus({ days: 4 }).startOf('hour')
    await assert.rejects(
      () =>
        calendar.createExternal(company.id, owner.id, {
          spaceId: space.id,
          type: 'external_hold',
          startsAt: start.toISO(),
          endsAt: start.plus({ hours: 2 }).toISO(),
          timezone: 'Asia/Riyadh',
          expiresAt: DateTime.now().minus({ minute: 1 }).toISO(),
        }),
      /must be in the future/
    )
  })

  test('failed external source update rolls back its block mutation', async ({ assert }) => {
    freezeTestTime()
    const { owner, company, space } = await setupCompanyHall()
    const start = DateTime.now().plus({ days: 6 }).startOf('hour')
    await calendar.createExternal(company.id, owner.id, {
      spaceId: space.id,
      type: 'maintenance',
      startsAt: start.toISO(),
      endsAt: start.plus({ hours: 2 }).toISO(),
      timezone: 'Asia/Riyadh',
    })
    const second = await calendar.createExternal(company.id, owner.id, {
      spaceId: space.id,
      type: 'internal_event',
      startsAt: start.plus({ hours: 3 }).toISO(),
      endsAt: start.plus({ hours: 5 }).toISO(),
      timezone: 'Asia/Riyadh',
    })
    const originalBlock = await db
      .from('space_inventory_blocks')
      .where('external_reservation_id', second.id)
      .firstOrFail()
    await assert.rejects(
      () =>
        calendar.updateExternal(company.id, owner.id, second.id, {
          spaceId: space.id,
          type: 'internal_event',
          startsAt: start.plus({ hour: 1 }).toISO(),
          endsAt: start.plus({ hours: 4 }).toISO(),
          timezone: 'Asia/Riyadh',
        }),
      /overlaps/
    )
    const unchangedSource = await db
      .from('external_reservations')
      .where('id', second.id)
      .firstOrFail()
    const unchangedBlock = await db
      .from('space_inventory_blocks')
      .where('external_reservation_id', second.id)
      .firstOrFail()
    assert.equal(
      new Date(unchangedSource.starts_at).toISOString(),
      new Date(second.starts_at).toISOString()
    )
    assert.equal(
      new Date(unchangedBlock.blocked_from_at).toISOString(),
      new Date(originalBlock.blocked_from_at).toISOString()
    )
  })
})
