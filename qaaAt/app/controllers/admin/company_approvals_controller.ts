import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { CompanyModerationService } from '#services/company_moderation_service'

@inject()
export default class CompanyApprovalsController {
  constructor(private moderation: CompanyModerationService) {}

  async store({ params, auth, response }: HttpContext) {
    const company = await this.moderation.approve(Number(params.id), auth.getUserOrFail().id)

    return response.ok({
      message: 'Company approved successfully',
      data: {
        id: company.id,
        status: company.status,
        approvedAt: company.approvedAt,
        approvedBy: company.approvedBy,
      },
    })
  }
}
