import { inject } from '@adonisjs/core'
import { Job } from '@adonisjs/queue'
import type { JobOptions } from '@adonisjs/queue/types'
import { NotificationOutboxService } from '#services/notification_outbox_service'

@inject()
export default class ProcessNotificationOutboxJob extends Job<Record<string, never>> {
  static options: JobOptions = { queue: 'notifications', maxRetries: 1, timeout: '2m' }

  constructor(private outbox: NotificationOutboxService) {
    super()
  }

  async execute() {
    await this.outbox.processPending()
  }
}
