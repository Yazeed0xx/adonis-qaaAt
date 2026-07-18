import { DateTime } from 'luxon'
import { belongsTo, hasMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { BookingSchema } from '#database/schema'
import User from '#models/user'
import PaymentDispute from '#models/payment_dispute'

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'expired'
  | 'payment_expired'
  | 'partially_refunded'
  | 'refunded'
export type PaymentStatus = 'unpaid' | 'deposit_paid' | 'paid' | 'partially_refunded' | 'refunded'

export default class Booking extends BookingSchema {
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

  @hasMany(() => PaymentDispute)
  declare paymentDisputes: HasMany<typeof PaymentDispute>
}
