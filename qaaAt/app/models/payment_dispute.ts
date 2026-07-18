import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { PaymentDisputeSchema } from '#database/schema'
import Booking from '#models/booking'
import Company from '#models/company'
import User from '#models/user'

export default class PaymentDispute extends PaymentDisputeSchema {
  @belongsTo(() => Booking)
  declare booking: BelongsTo<typeof Booking>

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'openedByAdminUserId' })
  declare openedByAdmin: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'resolvedByAdminUserId' })
  declare resolvedByAdmin: BelongsTo<typeof User>
}
