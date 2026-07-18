import { inject } from '@adonisjs/core'
import { Job } from '@adonisjs/queue'
import type { JobOptions } from '@adonisjs/queue/types'
import { ScheduledMaintenanceService } from '#services/scheduled_maintenance_service'

@inject()
export default class CleanupExpiredBookingsJob extends Job<Record<string, never>> {
  static options: JobOptions = {
    queue: 'default',
    maxRetries: 1,
    timeout: '2m',
  }

  constructor(private maintenance: ScheduledMaintenanceService) {
    super()
  }

  async execute() {
    await this.maintenance.run()
  }
}
