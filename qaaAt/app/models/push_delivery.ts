import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { PushDeliverySchema } from '#database/schema'
import Notification from '#models/notification'
import PushInstallation from '#models/push_installation'

export type PushDeliveryStatus =
  | 'pending'
  | 'sending'
  | 'ticket_received'
  | 'provider_accepted'
  | 'retry_scheduled'
  | 'permanently_failed'

export default class PushDelivery extends PushDeliverySchema {
  declare status: PushDeliveryStatus

  @belongsTo(() => Notification)
  declare notification: BelongsTo<typeof Notification>

  @belongsTo(() => PushInstallation)
  declare pushInstallation: BelongsTo<typeof PushInstallation>
}
