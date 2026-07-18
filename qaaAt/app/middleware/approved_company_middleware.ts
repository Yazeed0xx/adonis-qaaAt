import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import DomainException from '#exceptions/domain_exception'

/**
 * Approved company middleware ensures only approved companies can access certain routes
 * This middleware should be used after auth and company middleware
 */
export default class ApprovedCompanyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const company = ctx.companyContext.company

    switch (company.status) {
      case 'pending':
        throw new DomainException(
          'Your company is pending admin approval. You cannot perform this action yet.',
          403,
          'COMPANY_PENDING_APPROVAL'
        )

      case 'rejected':
        throw new DomainException(
          'Your company registration was rejected. Please contact support for more information.',
          403,
          'COMPANY_REJECTED'
        )

      case 'suspended':
        throw new DomainException(
          'Your company account has been suspended. Please contact support.',
          403,
          'COMPANY_SUSPENDED'
        )

      case 'approved':
        // Company is approved, proceed
        break

      default:
        throw new DomainException('Invalid company status.', 403, 'COMPANY_STATUS_INVALID')
    }

    return next()
  }
}
