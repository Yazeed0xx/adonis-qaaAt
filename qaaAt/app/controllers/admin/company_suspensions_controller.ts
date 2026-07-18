import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { CompanyModerationService } from '#services/company_moderation_service'
import {
  companyModerationParamsValidator,
  companyModerationReasonValidator,
} from '#validators/company_moderation_validator'

@inject()
export default class CompanySuspensionsController {
  constructor(private moderation: CompanyModerationService) {}

  async store({ params, request, auth, response }: HttpContext) {
    const { reason } = await request.validateUsing(companyModerationReasonValidator)
    const { id } = await request.validateUsing(companyModerationParamsValidator, { data: params })
    const company = await this.moderation.suspend(id, auth.getUserOrFail().id, reason)

    return response.ok({
      message: 'Company suspended successfully',
      data: {
        id: company.id,
        status: company.status,
        reason: company.rejectionReason,
      },
    })
  }

  async destroy({ params, request, auth, response }: HttpContext) {
    const { reason } = await request.validateUsing(companyModerationReasonValidator)
    const { id } = await request.validateUsing(companyModerationParamsValidator, { data: params })
    const company = await this.moderation.reactivate(id, auth.getUserOrFail().id, reason)

    return response.ok({
      message: 'Company reactivated successfully',
      data: {
        id: company.id,
        status: company.status,
      },
    })
  }
}
