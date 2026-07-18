import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import SpaceException from '#exceptions/space_exception'
import { SpaceDiscoveryService } from '#services/space_discovery_service'
import { freezeTestTime } from '#tests/support/clock'
import { withTruncateIsolation } from '#tests/support/database'
import {
  createSpaceFixture,
  createSpaceScenario,
  publishSpace,
} from '#tests/support/scenarios/spaces'

async function countSqlQueries<T>(callback: () => Promise<T>) {
  const client = db.connection().getWriteClient()
  let count = 0
  const listener = () => count++
  client.on('query', listener)
  try {
    return { result: await callback(), count }
  } finally {
    client.off('query', listener)
  }
}

test.group('Space discovery query budget', (group) => {
  group.each.setup(withTruncateIsolation)

  test('SQL query count stays constant as candidate count grows within one availability batch', async ({
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createSpaceScenario({ space: publishSpace() })
    await scenario.space.delete()
    const day = DateTime.now().setZone('Asia/Riyadh').plus({ days: 2 }).startOf('day')
    const service = new SpaceDiscoveryService()
    const addAvailableCandidates = async (count: number) => {
      const spaces = []
      for (let index = 0; index < count; index++) {
        spaces.push(
          await createSpaceFixture(
            scenario,
            scenario.venue,
            scenario.category,
            publishSpace({ nameEn: `Candidate ${count}-${index}` })
          )
        )
      }
      await db.table('space_availability_policies').multiInsert(
        spaces.map((space) => ({
          company_id: scenario.company.id,
          space_id: space.id,
          mode: 'full_day',
          slot_increment_minutes: 60,
          minimum_duration_minutes: 60,
          maximum_duration_minutes: 1440,
          minimum_notice_minutes: 0,
          maximum_advance_days: 365,
          preparation_buffer_minutes: 0,
          cleanup_buffer_minutes: 0,
          is_active: true,
        }))
      )
      await db.table('space_operating_hours').multiInsert(
        spaces.map((space) => ({
          company_id: scenario.company.id,
          space_id: space.id,
          weekday: day.weekday % 7,
          opens_at_local: '08:00',
          closes_at_local: '18:00',
          ends_next_day: false,
          sort_order: 0,
        }))
      )
    }
    const input = {
      from: day.toISO()!,
      to: day.plus({ days: 1 }).toISO()!,
      limit: 1,
    }

    await addAvailableCandidates(20)
    const small = await countSqlQueries(() => service.list(input))
    await db.from('space_operating_hours').delete()
    await db.from('space_availability_policies').delete()
    await db.from('spaces').delete()
    await addAvailableCandidates(180)
    const large = await countSqlQueries(() => service.list(input))

    assert.equal(small.result.meta.availabilityScan?.batchesScanned, 1)
    assert.equal(large.result.meta.availabilityScan?.batchesScanned, 1)
    assert.equal(small.count, large.count)
    assert.isAtMost(large.count, 6)
  })

  test('availability pagination crosses candidate batches without gaps or false next pages', async ({
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createSpaceScenario({ space: publishSpace() })
    await scenario.space.delete()
    const available = []
    for (let index = 0; index < 25; index++) {
      available.push(
        await createSpaceFixture(
          scenario,
          scenario.venue,
          scenario.category,
          publishSpace({ nameEn: `Available ${index}` })
        )
      )
    }
    await db.table('spaces').multiInsert(
      Array.from({ length: 205 }, (_, index) => ({
        company_id: scenario.company.id,
        venue_id: scenario.venue.id,
        category_id: scenario.category.id,
        name_en: `Unavailable ${index}`,
        booking_mode: 'request_to_book',
        publication_status: 'published',
        capacity_total: 20,
      }))
    )
    await db.table('space_availability_policies').multiInsert(
      available.map((space) => ({
        company_id: scenario.company.id,
        space_id: space.id,
        mode: 'full_day',
        slot_increment_minutes: 60,
        minimum_duration_minutes: 60,
        maximum_duration_minutes: 1440,
        minimum_notice_minutes: 0,
        maximum_advance_days: 365,
        preparation_buffer_minutes: 0,
        cleanup_buffer_minutes: 0,
        is_active: true,
      }))
    )
    const day = DateTime.now().setZone('Asia/Riyadh').plus({ days: 2 }).startOf('day')
    await db.table('space_operating_hours').multiInsert(
      available.map((space) => ({
        company_id: scenario.company.id,
        space_id: space.id,
        weekday: day.weekday % 7,
        opens_at_local: '08:00',
        closes_at_local: '18:00',
        ends_next_day: false,
        sort_order: 0,
      }))
    )
    const service = new SpaceDiscoveryService()
    const pages = []
    for (const page of [1, 2, 3, 4]) {
      pages.push(
        await service.list({
          from: day.toISO()!,
          to: day.plus({ days: 1 }).toISO()!,
          limit: 10,
          page,
        })
      )
    }

    const ids = pages.flatMap((page) => page.data.map((space) => space.id))
    assert.lengthOf(new Set(ids), 25)
    assert.deepEqual(new Set(ids), new Set(available.map((space) => space.id)))
    assert.deepEqual(
      pages.map((page) => page.meta.hasNextPage),
      [true, true, false, false]
    )
    assert.deepEqual(
      pages.map((page) => page.data.length),
      [10, 10, 5, 0]
    )
    assert.isTrue(
      pages.every(
        (page) =>
          page.meta.availabilityScan?.batchesScanned === 2 &&
          page.meta.availabilityScan.scannedCandidates <= 400
      )
    )
  })

  test('the bounded scan fails with SPACE_DISCOVERY_WORK_LIMIT after 2000 unresolved candidates', async ({
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createSpaceScenario({ space: publishSpace() })
    await scenario.space.delete()
    const rows = Array.from({ length: 2000 }, (_, index) => ({
      company_id: scenario.company.id,
      venue_id: scenario.venue.id,
      category_id: scenario.category.id,
      name_en: `Unresolvable ${index}`,
      booking_mode: 'request_to_book',
      publication_status: 'published',
      capacity_total: 20,
    }))
    for (let offset = 0; offset < rows.length; offset += 250) {
      await db.table('spaces').multiInsert(rows.slice(offset, offset + 250))
    }
    const day = DateTime.now().setZone('Asia/Riyadh').plus({ days: 2 }).startOf('day')

    try {
      await new SpaceDiscoveryService().list({
        from: day.toISO()!,
        to: day.plus({ days: 1 }).toISO()!,
        page: 1,
        limit: 10,
      })
      assert.fail('Expected the bounded discovery scan to reject unresolved work')
    } catch (error) {
      assert.instanceOf(error, SpaceException)
      if (error instanceof SpaceException) {
        assert.equal(error.code, 'SPACE_DISCOVERY_WORK_LIMIT')
        assert.equal(error.status, 422)
      }
    }
  }).timeout(30_000)
})
