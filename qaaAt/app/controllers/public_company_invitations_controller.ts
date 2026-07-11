import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { CompanyMembershipService } from '#services/company_membership_service'
import {
  acceptCompanyInvitationValidator,
  invitationTokenValidator,
} from '#validators/company_membership_validator'

@inject()
export default class PublicCompanyInvitationsController {
  constructor(private memberships: CompanyMembershipService) {}

  async inspect({ request, response }: HttpContext) {
    const payload = await request.validateUsing(invitationTokenValidator, { data: request.qs() })
    return response.ok({ data: await this.memberships.inspect(payload.token) })
  }

  async accept({ auth, request, response }: HttpContext) {
    const payload = await request.validateUsing(acceptCompanyInvitationValidator)
    await auth.check()
    const result = await this.memberships.accept(payload.token, auth.user ?? null, payload)
    return response.created({
      message: 'Invitation accepted successfully',
      data: {
        membership: {
          id: result.membership.id,
          companyId: result.membership.companyId,
          role: result.membership.role,
          status: result.membership.status,
        },
        token: { type: 'bearer', token: result.token },
      },
    })
  }
}
