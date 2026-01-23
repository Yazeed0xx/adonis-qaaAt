import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Hall from '#models/hall'
import BookingService from '#models/booking_service'
import Service from '#models/service'

export default class Booking extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column.date()
  declare bookingDate: DateTime

  @column()
  declare startTime: string

  @column()
  declare endTime: string

  @column()
  declare status: 'pending' | 'confirmed' | 'cancelled' | 'completed'

  @column()
  declare totalPrice: number

  @column()
  declare specialRequests: string | null

  @column()
  declare userId: number

  @column()
  declare hallId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @column.dateTime()
  declare deletedAt: DateTime | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Hall)
  declare hall: BelongsTo<typeof Hall>

  @hasMany(() => BookingService)
  declare bookingServices: HasMany<typeof BookingService>

  @manyToMany(() => Service, {
    pivotTable: 'booking_services',
    pivotForeignKey: 'booking_id',
    pivotRelatedForeignKey: 'service_id',
  })
  declare services: ManyToMany<typeof Service>
}
