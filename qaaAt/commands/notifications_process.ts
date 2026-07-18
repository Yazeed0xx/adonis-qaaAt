import { inject } from '@adonisjs/core'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { NotificationOutboxService } from '#services/notification_outbox_service'
import { PushDeliveryService } from '#services/push_delivery_service'

export default class NotificationsProcess extends BaseCommand {
  static commandName = 'notifications:process'
  static description = 'Process notification intent, push delivery, and push receipts once'
  static options: CommandOptions = { startApp: true }

  @flags.number({ description: 'Maximum notification outbox rows to claim', default: 50 })
  declare limit: number

  @flags.boolean({ description: 'Also check eligible push receipts', default: false })
  declare receipts: boolean

  @inject()
  async run(outbox: NotificationOutboxService, push: PushDeliveryService) {
    if (!Number.isInteger(this.limit) || this.limit < 1 || this.limit > 500) {
      this.logger.error('The --limit flag must be an integer between 1 and 500')
      this.exitCode = 2
      return
    }

    const notifications = await outbox.processPending(this.limit)
    const deliveries = await push.processPending(this.limit)
    const receipts = this.receipts ? await push.processReceipts(this.limit) : 0
    const result = { notifications, deliveries, receipts }

    this.logger.success(
      `Processed notifications=${notifications} deliveries=${deliveries} receipts=${receipts}`
    )
    return result
  }
}
