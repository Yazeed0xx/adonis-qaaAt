import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import DomainException from '#exceptions/domain_exception'

/**
 * User type middleware ensures only regular users can access certain routes
 */
export default class UserTypeMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.getUserOrFail()

    if (user.userType !== 'user' || !user.currentAccessToken?.allows('client:customer_app')) {
      throw new DomainException('Access denied. User account required.', 403, 'CUSTOMER_REQUIRED')
    }

    return next()
  }
}
