import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import Company from '#models/company'

/**
 * Approved company middleware ensures only approved companies can access certain routes
 * This middleware should be used after auth and company middleware
 */
export default class ApprovedCompanyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.getUserOrFail()

    if (user.userType !== 'company') {
      return ctx.response.forbidden({
        message: 'Access denied. Company account required.',
      })
    }

    const company = await Company.findBy('userId', user.id)

    if (!company) {
      return ctx.response.notFound({
        message: 'Company profile not found.',
      })
    }

    switch (company.status) {
      case 'pending':
        return ctx.response.forbidden({
          message: 'Your company is pending admin approval. You cannot perform this action yet.',
          code: 'COMPANY_PENDING_APPROVAL',
        })

      case 'rejected':
        return ctx.response.forbidden({
          message:
            'Your company registration was rejected. Please contact support for more information.',
          code: 'COMPANY_REJECTED',
          reason: company.rejectionReason,
        })

      case 'suspended':
        return ctx.response.forbidden({
          message: 'Your company account has been suspended. Please contact support.',
          code: 'COMPANY_SUSPENDED',
        })

      case 'approved':
        // Company is approved, proceed
        break

      default:
        return ctx.response.forbidden({
          message: 'Invalid company status.',
        })
    }

    return next()
  }
}
