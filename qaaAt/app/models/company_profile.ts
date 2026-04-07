import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { CompanyProfileSchema } from '#database/schema'
import User from '#models/user'

export default class CompanyProfile extends CompanyProfileSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
