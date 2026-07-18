import { test } from '@japa/runner'
import CleanupExpiredBookingsJob from '#jobs/cleanup_expired_bookings_job'
import type { ScheduledMaintenanceService } from '#services/scheduled_maintenance_service'

test.group('Scheduled maintenance job adapter', () => {
  test('delegates one queue execution to the shared maintenance operation', async ({ assert }) => {
    assert.plan(1)
    const maintenance = {
      async run() {
        assert.isTrue(true)
        return { bookings: 0, externalHolds: 0, requests: 0, quotes: 0 }
      },
    } as ScheduledMaintenanceService

    await new CleanupExpiredBookingsJob(maintenance).execute()
  })
})
