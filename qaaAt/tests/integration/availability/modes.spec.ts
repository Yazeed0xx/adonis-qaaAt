import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import InventoryException from '#exceptions/inventory_exception'
import calendar from '#services/company_calendar_service'
import availability from '#services/availability_service'
import availabilityPolicy from '#services/availability_policy_service'
import { createAvailabilityScenario as setupCompanyHall } from '#tests/support/scenarios/availability'
import { withTruncateIsolation } from '#tests/support/database'
import { freezeTestTime } from '#tests/support/clock'

test.group('Availability mode calculations', (group) => {
  group.each.setup(withTruncateIsolation)

  test('hourly mode supports requested durations through its maximum', async ({ assert }) => {
    freezeTestTime()
    const { company, space } = await setupCompanyHall()
    const day = DateTime.now().plus({ days: 9 }).setZone('Asia/Riyadh').startOf('day')
    await calendar.setPolicy(company.id, space.id, {
      mode: 'hourly',
      slotIncrementMinutes: 60,
      minimumDurationMinutes: 60,
      maximumDurationMinutes: 180,
      minimumNoticeMinutes: 0,
      maximumAdvanceDays: 365,
      preparationBufferMinutes: 0,
      cleanupBufferMinutes: 0,
      operatingHours: [{ weekday: day.weekday % 7, opensAtLocal: '08:00', closesAtLocal: '18:00' }],
    })
    const result = await calendarAvailability(space.id, day, 1, { durationMinutes: 120 })
    assert.isAbove(result.slots.length, 0)
    const first = result.slots[0]
    assert.equal(
      DateTime.fromISO(first.endAt!).diff(DateTime.fromISO(first.startAt!), 'minutes').minutes,
      120
    )
  })

  test('session mode returns configured named sessions and enforces exact session ranges', async ({
    assert,
  }) => {
    freezeTestTime()
    const { company, space } = await setupCompanyHall()
    const day = DateTime.now().plus({ days: 11 }).setZone('Asia/Riyadh').startOf('day')
    await calendar.setPolicy(company.id, space.id, {
      mode: 'session',
      slotIncrementMinutes: 60,
      minimumDurationMinutes: 240,
      maximumDurationMinutes: 240,
      minimumNoticeMinutes: 0,
      maximumAdvanceDays: 365,
      preparationBufferMinutes: 0,
      cleanupBufferMinutes: 0,
      operatingHours: [],
    })
    await calendar.saveSession(company.id, space.id, {
      code: 'evening',
      name: { ar: 'المساء', en: 'Evening' },
      weekday: day.weekday % 7,
      startsAtLocal: '18:00',
      endsAtLocal: '22:00',
    })
    const result = await calendarAvailability(space.id, day, 1)
    assert.equal(result.slots[0].code, 'evening')
    assert.equal(result.slots[0].nameAr, 'المساء')
  })

  test('full-day mode returns one complete configured day', async ({ assert }) => {
    freezeTestTime()
    const { company, space } = await setupCompanyHall()
    const day = DateTime.now().plus({ days: 12 }).setZone('Asia/Riyadh').startOf('day')
    await calendar.setPolicy(company.id, space.id, {
      mode: 'full_day',
      slotIncrementMinutes: 60,
      minimumDurationMinutes: 600,
      maximumDurationMinutes: 600,
      minimumNoticeMinutes: 0,
      maximumAdvanceDays: 365,
      preparationBufferMinutes: 0,
      cleanupBufferMinutes: 0,
      operatingHours: [{ weekday: day.weekday % 7, opensAtLocal: '08:00', closesAtLocal: '18:00' }],
    })
    const result = await calendarAvailability(space.id, day, 1)
    assert.lengthOf(result.slots, 1)
    assert.equal(
      DateTime.fromISO(result.slots[0].localStart!, { setZone: true }).toFormat('HH:mm'),
      '08:00'
    )
    assert.equal(
      DateTime.fromISO(result.slots[0].localEnd!, { setZone: true }).toFormat('HH:mm'),
      '18:00'
    )
    await db.transaction((trx) =>
      availabilityPolicy.assertRequestFitsAvailabilityPolicy(trx, {
        spaceId: space.id,
        startsAt: DateTime.fromISO(result.slots[0].startAt!, { setZone: true }),
        endsAt: DateTime.fromISO(result.slots[0].endAt!, { setZone: true }),
      })
    )
  })

  test('full-day mode does not expose a range across disjoint daily windows', async ({
    assert,
  }) => {
    freezeTestTime()
    const { company, space } = await setupCompanyHall()
    const day = DateTime.now().plus({ days: 12 }).setZone('Asia/Riyadh').startOf('day')
    await calendar.setPolicy(company.id, space.id, {
      mode: 'full_day',
      slotIncrementMinutes: 60,
      minimumDurationMinutes: 240,
      maximumDurationMinutes: 600,
      minimumNoticeMinutes: 0,
      maximumAdvanceDays: 365,
      preparationBufferMinutes: 0,
      cleanupBufferMinutes: 0,
      operatingHours: [
        { weekday: day.weekday % 7, opensAtLocal: '08:00', closesAtLocal: '12:00' },
        { weekday: day.weekday % 7, opensAtLocal: '14:00', closesAtLocal: '18:00' },
      ],
    })
    const result = await calendarAvailability(space.id, day, 1)
    assert.lengthOf(result.slots, 0)
  })

  test('multi-day mode returns a real contiguous configured range', async ({ assert }) => {
    freezeTestTime()
    const { company, space } = await setupCompanyHall()
    const day = DateTime.now().plus({ days: 13 }).setZone('Asia/Riyadh').startOf('day')
    await calendar.setPolicy(company.id, space.id, {
      mode: 'multi_day',
      slotIncrementMinutes: 60,
      minimumDurationMinutes: 2040,
      maximumDurationMinutes: 2040,
      minimumNoticeMinutes: 0,
      maximumAdvanceDays: 365,
      preparationBufferMinutes: 120,
      cleanupBufferMinutes: 120,
      operatingHours: [
        { weekday: day.weekday % 7, opensAtLocal: '08:00', closesAtLocal: '18:00' },
        {
          weekday: day.plus({ days: 1 }).weekday % 7,
          opensAtLocal: '08:00',
          closesAtLocal: '18:00',
        },
      ],
    })
    const result = await calendarAvailability(space.id, day, 3, { durationDays: 2 })
    assert.isAbove(result.slots.length, 0)
    assert.equal(
      DateTime.fromISO(result.slots[0].localEnd!, { setZone: true }).diff(
        DateTime.fromISO(result.slots[0].localStart!, { setZone: true }),
        'hours'
      ).hours,
      34
    )
  })

  test('two configured overnight days validate without requiring a third day', async ({
    assert,
  }) => {
    freezeTestTime()
    const { company, space } = await setupCompanyHall()
    const day = DateTime.now().plus({ days: 14 }).setZone('Asia/Riyadh').startOf('day')
    await calendar.setPolicy(company.id, space.id, {
      mode: 'multi_day',
      slotIncrementMinutes: 60,
      minimumDurationMinutes: 1920,
      maximumDurationMinutes: 1920,
      minimumNoticeMinutes: 0,
      maximumAdvanceDays: 365,
      preparationBufferMinutes: 60,
      cleanupBufferMinutes: 60,
      operatingHours: [
        {
          weekday: day.weekday % 7,
          opensAtLocal: '18:00',
          closesAtLocal: '02:00',
          endsNextDay: true,
        },
        {
          weekday: day.plus({ days: 1 }).weekday % 7,
          opensAtLocal: '18:00',
          closesAtLocal: '02:00',
          endsNextDay: true,
        },
      ],
    })
    const result = await calendarAvailability(space.id, day, 3, { durationDays: 2 })
    assert.lengthOf(result.slots, 1)
    await db.transaction((trx) =>
      availabilityPolicy.assertRequestFitsAvailabilityPolicy(trx, {
        spaceId: space.id,
        startsAt: DateTime.fromISO(result.slots[0].startAt!, { setZone: true }),
        endsAt: DateTime.fromISO(result.slots[0].endAt!, { setZone: true }),
      })
    )
  })

  test('multi-day validation rejects a genuine missing configured day', async ({ assert }) => {
    freezeTestTime()
    const { company, space } = await setupCompanyHall()
    const day = DateTime.now().plus({ days: 15 }).setZone('Asia/Riyadh').startOf('day')
    await calendar.setPolicy(company.id, space.id, {
      mode: 'multi_day',
      slotIncrementMinutes: 60,
      minimumDurationMinutes: 60,
      maximumDurationMinutes: 10080,
      minimumNoticeMinutes: 0,
      maximumAdvanceDays: 365,
      preparationBufferMinutes: 0,
      cleanupBufferMinutes: 0,
      operatingHours: [
        { weekday: day.weekday % 7, opensAtLocal: '08:00', closesAtLocal: '18:00' },
        {
          weekday: day.plus({ days: 2 }).weekday % 7,
          opensAtLocal: '08:00',
          closesAtLocal: '18:00',
        },
      ],
    })
    let rejection: unknown
    try {
      await db.transaction((trx) =>
        availabilityPolicy.assertRequestFitsAvailabilityPolicy(trx, {
          spaceId: space.id,
          startsAt: day.set({ hour: 8 }),
          endsAt: day.plus({ days: 2 }).set({ hour: 18 }),
        })
      )
    } catch (error) {
      rejection = error
    }
    if (!(rejection instanceof InventoryException)) throw rejection
    assert.equal(rejection.code, 'AVAILABILITY_MULTI_DAY_GAP')
  })
})

async function calendarAvailability(
  spaceId: number,
  localDay: DateTime,
  rangeDays: number,
  options: { durationMinutes?: number; durationDays?: number } = {}
) {
  const start = localDay.startOf('day').toUTC()
  return availability.publicAvailability(
    spaceId,
    start.toISO()!,
    localDay.plus({ days: rangeDays }).startOf('day').toUTC().toISO()!,
    options
  )
}
