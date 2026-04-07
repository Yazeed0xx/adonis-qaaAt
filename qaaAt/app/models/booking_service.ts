import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { BookingServiceSchema } from '#database/schema'
import Booking from '#models/booking'
import Service from '#models/service'

export default class BookingService extends BookingServiceSchema {
  @belongsTo(() => Booking)
  declare booking: BelongsTo<typeof Booking>

  @belongsTo(() => Service)
  declare service: BelongsTo<typeof Service>
}
