import { inject } from '@adonisjs/core'
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { ScheduledMaintenanceService } from '#services/scheduled_maintenance_service'

export default class MaintenanceExpire extends BaseCommand {
  static commandName = 'maintenance:expire'
  static description = 'Expire stale bookings, holds, requests, visits, and quotes once'
  static options: CommandOptions = { startApp: true }

  @inject()
  async run(maintenance: ScheduledMaintenanceService) {
    const result = await maintenance.run()
    this.logger.success(
      `Expired bookings=${result.bookings} external_holds=${result.externalHolds} requests=${result.requests} quotes=${result.quotes}`
    )
    return result
  }
}
