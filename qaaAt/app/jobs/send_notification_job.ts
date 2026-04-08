import { inject } from '@adonisjs/core'
import { Job } from '@adonisjs/queue'
import type { JobOptions } from '@adonisjs/queue/types'
import { NotificationService, type QueuedNotificationData } from '#services/notification_service'

@inject()
export default class SendNotificationJob extends Job<QueuedNotificationData> {
  static options: JobOptions = {
    queue: 'notifications',
    maxRetries: 4,
    timeout: '30s',
  }

  constructor(private notificationService: NotificationService) {
    super()
  }

  async execute() {
    await this.notificationService.notify(this.payload)
  }
}
