import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import InventoryException from '#exceptions/inventory_exception'
import calendar from '#services/company_calendar_service'
import availabilityPolicy from '#services/availability_policy_service'
import { freezeTestTime } from '#tests/support/clock'
import { withTruncateIsolation } from '#tests/support/database'
import { createAvailabilityScenario } from '#tests/support/scenarios/availability'

async function captureInventoryError(operation: () => Promise<unknown>) {
  try {
    await operation()
  } catch (error) {
    if (error instanceof InventoryException) return error
    throw error
  }
  throw new Error('Expected an InventoryException')
}

async function setupBoundaryPolicy() {
  const scenario = await createAvailabilityScenario()
  await calendar.setPolicy(scenario.company.id, scenario.space.id, {
    mode: 'hourly',
    slotIncrementMinutes: 1,
    minimumDurationMinutes: 60,
    maximumDurationMinutes: 240,
    minimumNoticeMinutes: 120,
    maximumAdvanceDays: 30,
    preparationBufferMinutes: 0,
    cleanupBufferMinutes: 0,
    operatingHours: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      opensAtLocal: '00:00',
      closesAtLocal: '23:59',
    })),
  })
  return scenario
}

async function assertAllowed(spaceId: number, startsAt: DateTime, endsAt: DateTime) {
  await db.transaction((trx) =>
    availabilityPolicy.assertRequestFitsAvailabilityPolicy(trx, { spaceId, startsAt, endsAt })
  )
}

test.group('Availability policy boundaries', (group) => {
  group.each.setup(withTruncateIsolation)

  test('minimum notice rejects one minute below the boundary and accepts the boundary', async ({
    assert,
  }) => {
    freezeTestTime()
    const { space } = await setupBoundaryPolicy()
    const tooSoon = DateTime.now().toUTC().plus({ minutes: 119 })
    const error = await captureInventoryError(() =>
      assertAllowed(space.id, tooSoon, tooSoon.plus({ minutes: 60 }))
    )
    assert.equal(error.code, 'AVAILABILITY_NOTICE_INVALID')

    const boundary = DateTime.now().toUTC().plus({ minutes: 120 })
    await assertAllowed(space.id, boundary, boundary.plus({ minutes: 60 }))
  })

  test('advance horizon accepts the exact day and rejects one minute beyond it', async ({
    assert,
  }) => {
    freezeTestTime()
    const { space } = await setupBoundaryPolicy()
    const boundary = DateTime.now().toUTC().plus({ days: 30 })
    await assertAllowed(space.id, boundary, boundary.plus({ minutes: 60 }))

    const tooFar = boundary.plus({ minute: 1 })
    const error = await captureInventoryError(() =>
      assertAllowed(space.id, tooFar, tooFar.plus({ minutes: 60 }))
    )
    assert.equal(error.code, 'AVAILABILITY_ADVANCE_INVALID')
  })

  test('duration enforces both inclusive limits', async ({ assert }) => {
    freezeTestTime()
    const { space } = await setupBoundaryPolicy()
    const start = DateTime.now().toUTC().plus({ days: 1 })

    const short = await captureInventoryError(() =>
      assertAllowed(space.id, start, start.plus({ minutes: 59 }))
    )
    assert.equal(short.code, 'AVAILABILITY_DURATION_INVALID')
    const long = await captureInventoryError(() =>
      assertAllowed(space.id, start, start.plus({ minutes: 241 }))
    )
    assert.equal(long.code, 'AVAILABILITY_DURATION_INVALID')
    await assertAllowed(space.id, start, start.plus({ minutes: 60 }))
    await assertAllowed(space.id, start, start.plus({ minutes: 240 }))
  })
})
