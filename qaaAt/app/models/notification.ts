import { DateTime } from 'luxon'
import { belongsTo, column, hasMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { NotificationSchema } from '#database/schema'
import User from '#models/user'
import PushDelivery from '#models/push_delivery'

export default class Notification extends NotificationSchema {
  @column({
    prepare: (value: Record<string, any> | null) => (value ? JSON.stringify(value) : null),
    consume: (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : (value ?? null)),
  })
  declare data: Record<string, any> | null

  get isRead(): boolean {
    return this.readAt !== null
  }

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => PushDelivery)
  declare pushDeliveries: HasMany<typeof PushDelivery>

  /**
   * Scope: Get only unread notifications
   */
  static unread = scope((query) => {
    query.whereNull('readAt')
  })

  /**
   * Scope: Get recent notifications (last 30 days)
   */
  static recent = scope((query) => {
    query.where('createdAt', '>=', DateTime.now().minus({ days: 30 }).toSQL())
  })
}
