import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export default class Notification extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare type: string

  @column()
  declare title: string

  @column()
  declare message: string

  @column()
  declare data: Record<string, any> | null

  @column.dateTime()
  declare readAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

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
