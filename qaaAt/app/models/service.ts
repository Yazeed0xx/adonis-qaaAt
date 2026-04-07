import { belongsTo, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import { ServiceSchema } from '#database/schema'
import Company from '#models/company'
import Booking from '#models/booking'

export default class Service extends ServiceSchema {
  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @manyToMany(() => Booking, {
    pivotTable: 'booking_services',
    pivotForeignKey: 'service_id',
    pivotRelatedForeignKey: 'booking_id',
  })
  declare bookings: ManyToMany<typeof Booking>
}
