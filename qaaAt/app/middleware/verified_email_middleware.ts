import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import DomainException from '#exceptions/domain_exception'

/**
 * Verified email middleware ensures only users with verified email can access certain routes
 */
export default class VerifiedEmailMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.getUserOrFail()

    if (!user.emailVerifiedAt) {
      throw new DomainException(
        'Please verify your email address before proceeding.',
        403,
        'EMAIL_NOT_VERIFIED'
      )
    }

    return next()
  }
}
