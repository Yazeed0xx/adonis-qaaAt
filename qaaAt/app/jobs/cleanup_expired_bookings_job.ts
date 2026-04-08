import { inject } from '@adonisjs/core'
import { Job } from '@adonisjs/queue'
import type { JobOptions } from '@adonisjs/queue/types'
import { BookingManagementService } from '#services/booking_management_service'

@inject()
export default class CleanupExpiredBookingsJob extends Job<Record<string, never>> {
  static options: JobOptions = {
    queue: 'default',
    maxRetries: 1,
    timeout: '2m',
  }

  constructor(private bookingManagementService: BookingManagementService) {
    super()
  }

  async execute() {
    await this.bookingManagementService.expireOldBookings()
  }
}
