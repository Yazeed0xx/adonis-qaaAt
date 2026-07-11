import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'
import { MigrationRunner } from '@adonisjs/lucid/migration'
import CompanyMembership from '#models/company_membership'
import { UserFactory } from '#database/factories/user_factory'
import { CompanyFactory } from '#database/factories/company_factory'
import { BookingFactory } from '#database/factories/booking_factory'
import { HallService } from '#services/hall_service'
import bookingManagement from '#services/booking_management_service'
import calendar from '#services/company_calendar_service'
import availability from '#services/availability_service'
import availabilityPolicy from '#services/availability_policy_service'
import BackfillMigration from '#database/migrations/1770000000011_seed_catalogs_and_backfill_halls'

async function setupCompanyHall() {
  await new BackfillMigration(db.connection(), import.meta.url).up()
  const owner = await UserFactory.apply('company', 'verified').create()
  const company = await CompanyFactory.apply('approved')
    .merge({ userId: owner.id })
    .with('companyProfile')
    .create()
  await CompanyMembership.create({
    companyId: company.id,
    userId: owner.id,
    role: 'owner',
    status: 'active',
    joinedAt: company.createdAt,
  })
  const hall = await new HallService().createHall(company.id, {
    name: 'Inventory Hall',
    capacity: 100,
    location: 'Free form',
    pricing: 1000,
    address: 'Road',
    city: 'Riyadh',
    amenities: {},
    images: [],
    services: [],
    isAvailable: true,
  })
  const space = await db.from('spaces').where('legacy_hall_id', hall.id).firstOrFail()
  return { owner, company, hall, space }
}

test.group('Sprint 3 availability and inventory', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('overlapping pending requests coexist but only one acceptance creates a hold and block', async ({
    assert,
  }) => {
    const { company, hall } = await setupCompanyHall()
    const firstUser = await UserFactory.apply('user', 'verified').create()
    const secondUser = await UserFactory.apply('user', 'verified').create()
    const date = DateTime.now().plus({ days: 10 }).startOf('day')
    const first = await BookingFactory.merge({
      userId: firstUser.id,
      hallId: hall.id,
      bookingDate: date,
      startTime: '10:00',
      endTime: '12:00',
      status: 'pending',
      expiresAt: DateTime.now().plus({ days: 7 }),
    }).create()
    const second = await BookingFactory.merge({
      userId: secondUser.id,
      hallId: hall.id,
      bookingDate: date,
      startTime: '10:00',
      endTime: '12:00',
      status: 'pending',
      expiresAt: DateTime.now().plus({ days: 7 }),
    }).create()
    assert.equal(
      await db
        .from('bookings')
        .where('status', 'pending')
        .count('* as total')
        .first()
        .then((row) => Number(row?.total)),
      2
    )
    await bookingManagement.acceptBooking(first.id, company.id, company.userId)
    await assert.rejects(
      () => bookingManagement.acceptBooking(second.id, company.id, company.userId),
      /overlaps/
    )
    await second.refresh()
    assert.equal(second.status, 'pending')
    assert.equal(
      await db
        .from('booking_holds')
        .where('status', 'active')
        .count('* as total')
        .first()
        .then((row) => Number(row?.total)),
      1
    )
    assert.equal(
      await db
        .from('space_inventory_blocks')
        .where('status', 'active')
        .count('* as total')
        .first()
        .then((row) => Number(row?.total)),
      1
    )
  })

  test('hold expiry transitions Booking and releases inventory atomically', async ({ assert }) => {
    const { company, hall } = await setupCompanyHall()
    const user = await UserFactory.apply('user', 'verified').create()
    const booking = await BookingFactory.merge({
      userId: user.id,
      hallId: hall.id,
      bookingDate: DateTime.now().plus({ days: 8 }),
      startTime: '10:00',
      endTime: '12:00',
      status: 'pending',
      expiresAt: DateTime.now().plus({ days: 7 }),
    }).create()
    await bookingManagement.acceptBooking(booking.id, company.id, company.userId)
    await db
      .from('booking_holds')
      .where('booking_id', booking.id)
      .update({ expires_at: DateTime.now().minus({ minute: 1 }).toSQL() })
    assert.equal(await bookingManagement.expirePaymentHolds(), 1)
    await booking.refresh()
    assert.equal(booking.status, 'payment_expired')
    const expiredHold = await db.from('booking_holds').where('booking_id', booking.id).firstOrFail()
    const releasedBlock = await db.from('space_inventory_blocks').firstOrFail()
    assert.equal(expiredHold.status, 'expired')
    assert.equal(releasedBlock.status, 'released')
  })

  test('cancellation releases only its active hold and block', async ({ assert }) => {
    const { company, hall } = await setupCompanyHall()
    const user = await UserFactory.apply('user', 'verified').create()
    const booking = await BookingFactory.merge({
      userId: user.id,
      hallId: hall.id,
      bookingDate: DateTime.now().plus({ days: 8 }),
      startTime: '10:00',
      endTime: '12:00',
      status: 'pending',
      expiresAt: DateTime.now().plus({ days: 7 }),
    }).create()
    await bookingManagement.acceptBooking(booking.id, company.id, company.userId)
    await bookingManagement.cancelBooking(booking.id, user.id)
    const cancelledHold = await db
      .from('booking_holds')
      .where('booking_id', booking.id)
      .firstOrFail()
    const releasedBlock = await db.from('space_inventory_blocks').firstOrFail()
    assert.equal(cancelledHold.status, 'cancelled')
    assert.equal(releasedBlock.status, 'released')
  })

  test('schedule closure removes candidates without creating inventory blocks', async ({
    client,
    assert,
  }) => {
    const { owner, space } = await setupCompanyHall()
    const date = DateTime.now().plus({ days: 5 }).setZone('Asia/Riyadh').startOf('day')
    const created = await client
      .post(`/api/companies/calendar/spaces/${space.id}/exceptions`)
      .withGuard('api')
      .loginAs(owner)
      .json({ localDate: date.toISODate(), kind: 'closed', reason: 'Configured closed day' })
    created.assertStatus(201)
    assert.equal(
      await db
        .from('space_inventory_blocks')
        .count('* as total')
        .first()
        .then((row) => Number(row?.total)),
      0
    )
    const result = await client.get(
      `/api/halls/${space.legacy_hall_id}/availability?date=${date.toISODate()}`
    )
    result.assertStatus(200)
    assert.lengthOf(result.body().data.slots, 0)
  })

  test('external hold expires and releases its source-backed block', async ({ assert }) => {
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

  test('concurrent external-hold workers claim each expired hold once', async ({ assert }) => {
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

  test('database requires exactly one unique block source', async ({ assert }) => {
    const { company, space } = await setupCompanyHall()
    const now = DateTime.now()
    await assert.rejects(
      () =>
        db.table('space_inventory_blocks').insert({
          company_id: company.id,
          space_id: space.id,
          starts_at: now.toSQL(),
          ends_at: now.plus({ hour: 1 }).toSQL(),
          blocked_from_at: now.toSQL(),
          blocked_until_at: now.plus({ hour: 1 }).toSQL(),
          created_at: now.toSQL(),
        }),
      /space_inventory_blocks_one_source_check/
    )
  })

  test('public and company range limits reject abusive requests', async ({ client }) => {
    const { owner, space } = await setupCompanyHall()
    const from = DateTime.now().toUTC()
    const publicResult = await client.get(
      `/api/spaces/${space.id}/availability?from=${encodeURIComponent(from.toISO()!)}&to=${encodeURIComponent(from.plus({ days: 32 }).toISO()!)}`
    )
    publicResult.assertStatus(422)
    const companyResult = await client
      .get(
        `/api/companies/calendar?from=${encodeURIComponent(from.toISO()!)}&to=${encodeURIComponent(from.plus({ days: 94 }).toISO()!)}`
      )
      .withGuard('api')
      .loginAs(owner)
    companyResult.assertStatus(422)
  })

  test('request creation and transactional acceptance both enforce schedule policy', async ({
    assert,
  }) => {
    const { owner, company, hall, space } = await setupCompanyHall()
    const user = await UserFactory.apply('user', 'verified').create()
    const date = DateTime.now().plus({ days: 10 }).setZone('Asia/Riyadh').startOf('day')
    await assert.rejects(
      () =>
        bookingManagement.createBooking(user.id, {
          hallId: hall.id,
          bookingDate: date,
          startTime: '06:00',
          endTime: '08:00',
        }),
      /outside operating hours/
    )
    const pending = await bookingManagement.createBooking(user.id, {
      hallId: hall.id,
      bookingDate: date,
      startTime: '10:00',
      endTime: '12:00',
    })
    await calendar.addException(company.id, space.id, owner.id, {
      localDate: date.toISODate(),
      kind: 'closed',
    })
    await assert.rejects(
      () => bookingManagement.acceptBooking(pending.id, company.id, owner.id),
      /closed date/
    )
    await pending.refresh()
    assert.equal(pending.status, 'pending')
    const holdCount = await db.from('booking_holds').count('* as total').firstOrFail()
    assert.equal(Number(holdCount.total), 0)
  })

  test('hourly mode supports requested durations through its maximum', async ({ assert }) => {
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
    assert.equal((rejection as { code?: string })?.code, 'AVAILABILITY_MULTI_DAY_GAP')
  })

  test('policy, session, and exception management APIs enforce their contracts', async ({
    client,
    assert,
  }) => {
    const { owner, space } = await setupCompanyHall()
    const policy = await client
      .get(`/api/companies/calendar/spaces/${space.id}/policy`)
      .withGuard('api')
      .loginAs(owner)
    policy.assertStatus(200)
    const overlappingHours = await client
      .put(`/api/companies/calendar/spaces/${space.id}/policy`)
      .withGuard('api')
      .loginAs(owner)
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
    overlappingHours.assertStatus(422)
    const invalidTime = await client
      .post(`/api/companies/calendar/spaces/${space.id}/exceptions`)
      .withGuard('api')
      .loginAs(owner)
      .json({
        localDate: '2030-01-01',
        kind: 'modified_hours',
        startsAtLocal: '99:99',
        endsAtLocal: '12:00',
      })
    invalidTime.assertStatus(422)
    const missingWindow = await client
      .post(`/api/companies/calendar/spaces/${space.id}/exceptions`)
      .withGuard('api')
      .loginAs(owner)
      .json({ localDate: '2030-01-01', kind: 'modified_hours' })
    missingWindow.assertStatus(422)
    const created = await client
      .post(`/api/companies/calendar/spaces/${space.id}/sessions`)
      .withGuard('api')
      .loginAs(owner)
      .json({
        code: 'morning',
        name: { en: 'Morning' },
        weekday: 1,
        startsAtLocal: '08:00',
        endsAtLocal: '12:00',
      })
    created.assertStatus(201)
    const overlappingSession = await client
      .post(`/api/companies/calendar/spaces/${space.id}/sessions`)
      .withGuard('api')
      .loginAs(owner)
      .json({
        code: 'overlap',
        name: { en: 'Overlap' },
        weekday: 1,
        startsAtLocal: '11:00',
        endsAtLocal: '13:00',
      })
    overlappingSession.assertStatus(422)
    const sessions = await client
      .get(`/api/companies/calendar/spaces/${space.id}/sessions`)
      .withGuard('api')
      .loginAs(owner)
    sessions.assertStatus(200)
    assert.lengthOf(sessions.body().data, 1)
    const removed = await client
      .delete(`/api/companies/calendar/spaces/${space.id}/sessions/${created.body().data.id}`)
      .withGuard('api')
      .loginAs(owner)
    removed.assertStatus(204)

    const exception = await client
      .post(`/api/companies/calendar/spaces/${space.id}/exceptions`)
      .withGuard('api')
      .loginAs(owner)
      .json({
        localDate: '2030-01-02',
        kind: 'modified_hours',
        startsAtLocal: '10:00',
        endsAtLocal: '14:00',
      })
    exception.assertStatus(201)
    const overlappingException = await client
      .post(`/api/companies/calendar/spaces/${space.id}/exceptions`)
      .withGuard('api')
      .loginAs(owner)
      .json({
        localDate: '2030-01-02',
        kind: 'open_override',
        startsAtLocal: '13:00',
        endsAtLocal: '16:00',
      })
    overlappingException.assertStatus(422)
    const updatedException = await client
      .put(`/api/companies/calendar/spaces/${space.id}/exceptions/${exception.body().data.id}`)
      .withGuard('api')
      .loginAs(owner)
      .json({
        localDate: '2030-01-02',
        kind: 'modified_hours',
        startsAtLocal: '09:00',
        endsAtLocal: '15:00',
      })
    updatedException.assertStatus(200)
    const exceptions = await client
      .get(`/api/companies/calendar/spaces/${space.id}/exceptions`)
      .withGuard('api')
      .loginAs(owner)
    exceptions.assertStatus(200)
    assert.lengthOf(exceptions.body().data, 1)
    const removedException = await client
      .delete(`/api/companies/calendar/spaces/${space.id}/exceptions/${exception.body().data.id}`)
      .withGuard('api')
      .loginAs(owner)
    removedException.assertStatus(204)
  })

  test('Sprint 3 rollback maps payment_expired to expired before restoring the old constraint', async ({
    assert,
  }) => {
    const { hall } = await setupCompanyHall()
    const user = await UserFactory.apply('user', 'verified').create()
    const booking = await BookingFactory.merge({
      userId: user.id,
      hallId: hall.id,
      status: 'payment_expired',
    }).create()
    let rolledBack = false
    let restoreError: Error | null = null
    try {
      const rollback = new MigrationRunner(db, app, {
        direction: 'down',
        step: 2,
        disableLocks: true,
      })
      await rollback.run()
      if (rollback.error) throw rollback.error
      rolledBack = true
      const row = await db.from('bookings').where('id', booking.id).firstOrFail()
      assert.equal(row.status, 'expired')
    } finally {
      if (rolledBack) {
        const migrate = new MigrationRunner(db, app, { direction: 'up', disableLocks: true })
        await migrate.run()
        restoreError = migrate.error
      }
    }
    if (restoreError) throw restoreError
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
