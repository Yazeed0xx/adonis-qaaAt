import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { UserProfileSchema } from '#database/schema'
import User from '#models/user'

export default class UserProfile extends UserProfileSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
