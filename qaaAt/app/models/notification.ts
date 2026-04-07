import { DateTime } from 'luxon'
import { belongsTo, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { NotificationSchema } from '#database/schema'
import User from '#models/user'

export default class Notification extends NotificationSchema {
  declare data: Record<string, any> | null

  get isRead(): boolean {
    return this.readAt !== null
  }

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

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
