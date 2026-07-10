import { belongsTo, column, hasMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import { HallSchema } from '#database/schema'
import Company from '#models/company'
import Booking from '#models/booking'

export default class Hall extends HallSchema {
  static publiclyVisible = scope((query) => {
    query
      .where('isAvailable', true)
      .whereNull('deletedAt')
      .whereExists((companyQuery) => {
        companyQuery
          .from('companies')
          .innerJoin('users', 'users.id', 'companies.user_id')
          .whereColumn('companies.id', 'halls.company_id')
          .where('companies.status', 'approved')
          .whereNull('companies.deleted_at')
          .whereNull('users.deleted_at')
      })
  })

  declare id: number

  declare name: string

  declare description: string | null

  declare capacity: number

  declare location: string

  @column({
    prepare: (value: Record<string, any> | null) => (value ? JSON.stringify(value) : null),
    consume: (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : (value ?? null)),
  })
  declare amenities: Record<string, any> | null

  declare pricing: string

  @column({
    prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : (value ?? null)),
  })
  declare images: string[] | null

  declare address: string

  declare city: string

  @column({
    prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : (value ?? null)),
  })
  declare services: string[] | null

  declare isAvailable: boolean

  declare createdAt: DateTime

  declare updatedAt: DateTime | null

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @hasMany(() => Booking)
  declare bookings: HasMany<typeof Booking>
}
