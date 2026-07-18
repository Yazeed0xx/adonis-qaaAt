import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import InventoryException from '#exceptions/inventory_exception'
import { UserFactory } from '#database/factories/user_factory'
import Booking from '#models/booking'
import bookingManagement from '#services/booking_management_service'
import { createAvailabilityScenario as setupCompanyHall } from '#tests/support/scenarios/availability'
import { withTruncateIsolation } from '#tests/support/database'
import { freezeTestTime } from '#tests/support/clock'

test.group('Booking hold inventory invariants', (group) => {
  group.each.setup(withTruncateIsolation)

  test('overlapping pending requests coexist but only one acceptance creates a hold and block', async ({
    assert,
  }) => {
    freezeTestTime()
    const { company, space } = await setupCompanyHall()
    const firstUser = await UserFactory.apply('user', 'verified').create()
    const secondUser = await UserFactory.apply('user', 'verified').create()
    const date = DateTime.now().plus({ days: 10 }).startOf('day')
    const first = await createPendingBooking(firstUser.id, company.id, space, date)
    const second = await createPendingBooking(secondUser.id, company.id, space, date)
    const pendingBeforeAcceptance = await db
      .from('bookings')
      .where('status', 'pending')
      .count('* as total')
      .firstOrFail()
    assert.equal(Number(pendingBeforeAcceptance.total), 2)
    const attempts = await Promise.allSettled([
      bookingManagement.acceptBooking(first.id, company.id, company.userId),
      bookingManagement.acceptBooking(second.id, company.id, company.userId),
    ])
    const winners = attempts.filter((attempt) => attempt.status === 'fulfilled')
    const losers = attempts.filter((attempt) => attempt.status === 'rejected')
    assert.lengthOf(winners, 1)
    assert.lengthOf(losers, 1)
    assert.instanceOf(losers[0].reason, InventoryException)
    assert.equal(losers[0].reason.code, 'INVENTORY_OVERLAP')
    await first.refresh()
    await second.refresh()
    assert.sameMembers([first.status, second.status], ['accepted', 'pending'])
    const activeHolds = await db
      .from('booking_holds')
      .where('status', 'active')
      .count('* as total')
      .firstOrFail()
    const activeBlocks = await db
      .from('space_inventory_blocks')
      .where('status', 'active')
      .count('* as total')
      .firstOrFail()
    assert.equal(Number(activeHolds.total), 1)
    assert.equal(Number(activeBlocks.total), 1)
  })

  test('hold expiry transitions Booking and releases inventory atomically', async ({ assert }) => {
    freezeTestTime()
    const { company, space } = await setupCompanyHall()
    const user = await UserFactory.apply('user', 'verified').create()
    const booking = await createPendingBooking(
      user.id,
      company.id,
      space,
      DateTime.now().plus({ days: 8 }).startOf('day')
    )
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
    freezeTestTime()
    const { company, space } = await setupCompanyHall()
    const user = await UserFactory.apply('user', 'verified').create()
    const booking = await createPendingBooking(
      user.id,
      company.id,
      space,
      DateTime.now().plus({ days: 8 }).startOf('day')
    )
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
})

async function createPendingBooking(
  userId: number,
  companyId: number,
  space: { id: number; venueId: number; nameEn: string | null },
  date: DateTime
) {
  const localStart = date.setZone('Asia/Riyadh').set({ hour: 10 })
  const localEnd = localStart.plus({ hours: 2 })
  return Booking.create({
    userId,
    companyId,
    venueId: space.venueId,
    spaceId: space.id,
    requestReference: `TEST-${crypto.randomUUID()}`,
    bookingDate: localStart.startOf('day'),
    startTime: '10:00',
    endTime: '12:00',
    totalPrice: '0.00',
    status: 'pending',
    paymentStatus: 'unpaid',
    expiresAt: DateTime.now().plus({ days: 7 }),
    responseExpiresAt: DateTime.now().plus({ days: 7 }),
    submittedAt: DateTime.now(),
    spaceNameSnapshotEn: space.nameEn,
    categorySlugSnapshot: 'meeting_room',
    customerNameSnapshot: 'Inventory Customer',
    customerEmailSnapshot: `inventory-${userId}@example.com`,
    contactPreference: 'in_app',
    startsAt: localStart.toUTC(),
    endsAt: localEnd.toUTC(),
    originalStartLocal: localStart.toISO({ includeOffset: false })!,
    originalEndLocal: localEnd.toISO({ includeOffset: false })!,
    originalTimezone: 'Asia/Riyadh',
  })
}
