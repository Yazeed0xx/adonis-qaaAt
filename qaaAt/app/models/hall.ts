import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Company from '#models/company'
import Booking from '#models/booking'

export default class Hall extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column()
  declare capacity: number

  @column()
  declare location: string

  @column()
  declare amenities: Record<string, any> | null

  @column()
  declare pricing: number

  @column()
  declare images: string[] | null

  @column()
  declare address: string

  @column()
  declare city: string

  @column()
  declare services: string[] | null

  @column()
  declare isAvailable: boolean

  @column()
  declare companyId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @column.dateTime()
  declare deletedAt: DateTime | null

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @hasMany(() => Booking)
  declare bookings: HasMany<typeof Booking>
}
