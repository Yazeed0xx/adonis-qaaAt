import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { CompanyMembershipSchema } from '#database/schema'
import Company from '#models/company'
import User from '#models/user'
import CompanyMembershipPermission from '#models/company_membership_permission'

export default class CompanyMembership extends CompanyMembershipSchema {
  @belongsTo(() => Company) declare company: BelongsTo<typeof Company>
  @belongsTo(() => User) declare user: BelongsTo<typeof User>
  @hasMany(() => CompanyMembershipPermission) declare permissionOverrides: HasMany<
    typeof CompanyMembershipPermission
  >
}
