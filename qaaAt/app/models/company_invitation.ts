import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { CompanyInvitationSchema } from '#database/schema'
import Company from '#models/company'
import User from '#models/user'

export default class CompanyInvitation extends CompanyInvitationSchema {
  @belongsTo(() => Company) declare company: BelongsTo<typeof Company>
  @belongsTo(() => User, { foreignKey: 'invitedByUserId' }) declare invitedBy: BelongsTo<
    typeof User
  >
  @belongsTo(() => User, { foreignKey: 'acceptedByUserId' }) declare acceptedBy: BelongsTo<
    typeof User
  >
}
