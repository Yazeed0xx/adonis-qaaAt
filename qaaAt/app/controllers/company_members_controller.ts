import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { CompanyMembershipService } from '#services/company_membership_service'
import companyContextService from '#services/company_context_service'
import { updateCompanyMemberValidator } from '#validators/company_membership_validator'
import {
  resolvePermissions,
  type CompanyRole,
  type CompanyPermission,
} from '#lib/company_permissions'

@inject()
export default class CompanyMembersController {
  constructor(private memberships: CompanyMembershipService) {}

  async index({ companyContext, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'members.view')
    const members = await this.memberships.listMembers(companyContext)
    return response.ok({ data: members.map((member) => this.serialize(member)) })
  }

  async update({ auth, companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'members.manage')
    const payload = await request.validateUsing(updateCompanyMemberValidator)
    const member = await this.memberships.updateMember(
      companyContext,
      auth.getUserOrFail().id,
      Number(params.id),
      payload
    )
    return response.ok({ message: 'Member updated successfully', data: this.serialize(member) })
  }

  async destroy({ auth, companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'members.manage')
    await this.memberships.revokeMember(companyContext, auth.getUserOrFail().id, Number(params.id))
    return response.noContent()
  }

  private serialize(member: any) {
    const overrides = (member.permissionOverrides ?? []).map((item: any) => ({
      permission: item.permission,
      effect: item.effect,
    }))
    return {
      id: member.id,
      companyId: member.companyId,
      user: member.user
        ? {
            id: member.user.id,
            name: member.user.userName,
            email: member.user.email,
            phone: member.user.userProfile?.phone ?? null,
          }
        : undefined,
      role: member.role,
      status: member.status,
      permissions: resolvePermissions(
        member.role as CompanyRole,
        overrides as Array<{ permission: CompanyPermission; effect: 'allow' | 'deny' }>
      ),
      permissionOverrides: overrides,
      joinedAt: member.joinedAt,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    }
  }
}
