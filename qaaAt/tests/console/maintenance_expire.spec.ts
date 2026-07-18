import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import MaintenanceExpire from '#commands/maintenance_expire'
import { withTruncateIsolation } from '#tests/support/database'

test.group('Command maintenance:expire', (group) => {
  group.each.setup(withTruncateIsolation)
  group.each.setup(() => {
    ace.ui.switchMode('raw')
    return () => ace.ui.switchMode('normal')
  })

  test('runs every expiry boundary and remains idempotent when no work is due', async ({
    assert,
  }) => {
    const first = await ace.create(MaintenanceExpire, [])
    await first.exec()
    first.assertSucceeded()
    first.assertLogMatches(/Expired bookings=0 external_holds=0 requests=0 quotes=0/)
    assert.deepEqual(first.result, { bookings: 0, externalHolds: 0, requests: 0, quotes: 0 })

    const replay = await ace.create(MaintenanceExpire, [])
    await replay.exec()
    replay.assertSucceeded()
    assert.deepEqual(replay.result, { bookings: 0, externalHolds: 0, requests: 0, quotes: 0 })
  })
})
