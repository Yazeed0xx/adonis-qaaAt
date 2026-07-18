import CompanyMembership from '#models/company_membership'
import type Company from '#models/company'
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
  async resolve(userId: number, companyId: number): Promise<CompanyContext> {
    const membership = await CompanyMembership.query()
      .where('userId', userId)
      .where('companyId', companyId)
      .where('status', 'active')
      .whereHas('company', (company) => company.whereNull('deletedAt'))
      .preload('company')
      .preload('permissionOverrides')
      .first()
    if (!membership)
      throw new CompanyMembershipException(
        'Active company membership required',
        'COMPANY_MEMBERSHIP_REQUIRED',
        403
      )
    if (membership.company.status === 'suspended')
      throw new CompanyMembershipException('Company access is suspended', 'COMPANY_SUSPENDED', 403)
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
