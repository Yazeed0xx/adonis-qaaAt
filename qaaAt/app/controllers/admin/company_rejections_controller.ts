import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import InvalidInputException from '#exceptions/invalid_input_exception'
import { CompanyModerationService } from '#services/company_moderation_service'

@inject()
export default class CompanyRejectionsController {
  constructor(private moderation: CompanyModerationService) {}

  async store({ params, request, auth, response }: HttpContext) {
    const { reason } = request.only(['reason'])

    if (!reason || reason.trim().length < 10) {
      throw new InvalidInputException(
        'Rejection reason is required and must be at least 10 characters',
        'REJECTION_REASON_INVALID'
      )
    }

    const company = await this.moderation.reject(
      Number(params.id),
      auth.getUserOrFail().id,
      reason.trim()
    )

    return response.ok({
      message: 'Company rejected successfully',
      data: {
        id: company.id,
        status: company.status,
        rejectionReason: company.rejectionReason,
        rejectedAt: company.rejectedAt,
      },
    })
  }
}
