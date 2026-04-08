import { DateTime } from 'luxon'
import { belongsTo, column, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { NotificationSchema } from '#database/schema'
import User from '#models/user'

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
