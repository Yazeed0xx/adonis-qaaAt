import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { CompanyMembershipService } from '#services/company_membership_service'
import companyContextService from '#services/company_context_service'
import { createCompanyInvitationValidator } from '#validators/company_membership_validator'

@inject()
export default class CompanyInvitationsController {
  constructor(private memberships: CompanyMembershipService) {}

  async index({ companyContext, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'members.view')
    const invitations = await this.memberships.listInvitations(companyContext)
    return response.ok({ data: invitations.map((item) => this.serialize(item)) })
  }

  async store({ auth, companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'members.manage')
    const payload = await request.validateUsing(createCompanyInvitationValidator)
    const invitation = await this.memberships.createInvitation(
      companyContext,
      auth.getUserOrFail().id,
      payload
    )
    return response.created({
      message: 'Invitation created successfully',
      data: this.serialize(invitation),
    })
  }

  async resend({ auth, companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'members.manage')
    const invitation = await this.memberships.resend(
      companyContext,
      auth.getUserOrFail().id,
      Number(params.id)
    )
    return response.ok({
      message: 'Invitation resent successfully',
      data: this.serialize(invitation),
    })
  }

  async destroy({ auth, companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'members.manage')
    await this.memberships.cancelInvitation(
      companyContext,
      auth.getUserOrFail().id,
      Number(params.id)
    )
    return response.noContent()
  }

  private serialize(item: any) {
    return {
      id: item.id,
      name: item.name,
      invitedEmail: item.invitedEmail,
      invitedPhone: item.invitedPhone,
      role: item.role,
      permissionOverrides: item.permissionOverrides,
      status: item.status,
      expiresAt: item.expiresAt,
      acceptedAt: item.acceptedAt,
      cancelledAt: item.cancelledAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }
  }
}
