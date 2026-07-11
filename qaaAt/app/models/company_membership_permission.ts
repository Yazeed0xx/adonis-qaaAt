import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { CompanyMembershipPermissionSchema } from '#database/schema'
import CompanyMembership from '#models/company_membership'

export default class CompanyMembershipPermission extends CompanyMembershipPermissionSchema {
  @belongsTo(() => CompanyMembership) declare companyMembership: BelongsTo<typeof CompanyMembership>
}
