import { inject } from '@adonisjs/core'
import { Job } from '@adonisjs/queue'
import type { JobOptions } from '@adonisjs/queue/types'
import { PushDeliveryService } from '#services/push_delivery_service'

@inject()
export default class ProcessPushDeliveriesJob extends Job<Record<string, never>> {
  static options: JobOptions = { queue: 'push', maxRetries: 1, timeout: '2m' }

  constructor(private deliveries: PushDeliveryService) {
    super()
  }

  async execute() {
    await this.deliveries.processPending()
  }
}
