import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { HallSchema } from '#database/schema'
import Company from '#models/company'
import Booking from '#models/booking'

export default class Hall extends HallSchema {
  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @hasMany(() => Booking)
  declare bookings: HasMany<typeof Booking>
}
