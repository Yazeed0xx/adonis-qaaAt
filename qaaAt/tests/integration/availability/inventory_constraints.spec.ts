import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { createAvailabilityScenario as setupCompanyHall } from '#tests/support/scenarios/availability'
import { withTruncateIsolation } from '#tests/support/database'
import { freezeTestTime } from '#tests/support/clock'

test.group('Inventory database constraints', (group) => {
  group.each.setup(withTruncateIsolation)

  test('database requires exactly one unique block source', async ({ assert }) => {
    freezeTestTime()
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
})
