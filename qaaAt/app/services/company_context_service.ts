import CompanyMembership from '#models/company_membership'
import type Company from '#models/company'
import CompanyModel from '#models/company'
import CompanyMembershipException from '#exceptions/company_membership_exception'
import {
  resolvePermissions,
  type CompanyPermission,
  type CompanyRole,
} from '#lib/company_permissions'

export interface CompanyContext {
  membership: CompanyMembership
  company: Company
  companyId: number
  role: CompanyRole
  permissions: CompanyPermission[]
}

export class CompanyContextService {
  async resolve(userId: number, companyId?: number): Promise<CompanyContext> {
    const query = CompanyMembership.query()
      .where('userId', userId)
      .where('status', 'active')
      .whereHas('company', (company) => company.whereNull('deletedAt'))
      .preload('company')
      .preload('permissionOverrides')
      .orderBy('id', 'asc')
    if (companyId) query.where('companyId', companyId)
    let membership = await query.first()
    if (!membership && !companyId) {
      const legacyCompany = await CompanyModel.query()
        .where('userId', userId)
        .whereNull('deletedAt')
        .first()
      if (legacyCompany) {
        await CompanyMembership.updateOrCreate(
          { companyId: legacyCompany.id, userId },
          { role: 'owner', status: 'active', joinedAt: legacyCompany.createdAt }
        )
        membership = await CompanyMembership.query()
          .where('companyId', legacyCompany.id)
          .where('userId', userId)
          .preload('company')
          .preload('permissionOverrides')
          .first()
      }
    }
    if (!membership)
      throw new CompanyMembershipException(
        'Active company membership required',
        'COMPANY_MEMBERSHIP_REQUIRED',
        403
      )
    const overrides = membership.permissionOverrides.map((item) => ({
      permission: item.permission as CompanyPermission,
      effect: item.effect as 'allow' | 'deny',
    }))
    return {
      membership,
      company: membership.company,
      companyId: membership.companyId,
      role: membership.role as CompanyRole,
      permissions: resolvePermissions(membership.role as CompanyRole, overrides),
    }
  }

  requirePermission(context: CompanyContext, permission: CompanyPermission) {
    if (!context.permissions.includes(permission)) {
      throw new CompanyMembershipException(
        `Permission ${permission} is required`,
        'COMPANY_PERMISSION_REQUIRED',
        403
      )
    }
  }
}

export default new CompanyContextService()
