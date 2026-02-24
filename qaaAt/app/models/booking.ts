import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany, manyToMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Hall from '#models/hall'
import BookingService from '#models/booking_service'
import Service from '#models/service'

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'expired'
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded'

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
  declare status: BookingStatus

  @column()
  declare totalPrice: number

  @column()
  declare specialRequests: string | null

  @column()
  declare rejectionReason: string | null

  @column.dateTime()
  declare companyRespondedAt: DateTime | null

  @column.dateTime()
  declare expiresAt: DateTime | null

  @column()
  declare paymentStatus: PaymentStatus

  @column.dateTime()
  declare paymentDueDate: DateTime | null

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

  /**
   * Check if booking has expired (company didn't respond within 7 days)
   */
  get isExpired(): boolean {
    if (this.status !== 'pending') return false
    if (!this.expiresAt) return false
    return this.expiresAt < DateTime.now()
  }

  /**
   * Check if booking is awaiting company response
   */
  get isPendingResponse(): boolean {
    return this.status === 'pending' && !this.isExpired
  }

  /**
   * Scope: Get only pending bookings
   */
  static pending = scope((query) => {
    query.where('status', 'pending')
  })

  /**
   * Scope: Get expired bookings (pending and past expiry date)
   */
  static expired = scope((query) => {
    query.where('status', 'pending').where('expiresAt', '<', DateTime.now().toSQL())
  })

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
    pivotColumns: ['price_at_booking'],
    pivotTimestamps: true,
  })
  declare services: ManyToMany<typeof Service>
}
