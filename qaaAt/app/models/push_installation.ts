import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { PushInstallationSchema } from '#database/schema'
import User from '#models/user'
import PushDelivery from '#models/push_delivery'

export default class PushInstallation extends PushInstallationSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => PushDelivery)
  declare deliveries: HasMany<typeof PushDelivery>
}
