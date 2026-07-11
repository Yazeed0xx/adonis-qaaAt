import { inject } from '@adonisjs/core'
import { Job } from '@adonisjs/queue'
import type { JobOptions } from '@adonisjs/queue/types'
import { PaymentService } from '#services/payment_service'

@inject()
export default class ReplayPaymentWebhooksJob extends Job<Record<string, never>> {
  static options: JobOptions = { queue: 'default', maxRetries: 3, timeout: '2m' }

  constructor(private payments: PaymentService) {
    super()
  }

  async execute() {
    await this.payments.replayReceivedWebhookEvents()
  }
}
