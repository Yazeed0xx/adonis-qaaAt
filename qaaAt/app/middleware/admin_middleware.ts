import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import DomainException from '#exceptions/domain_exception'

/**
 * Admin middleware is used to ensure only admin users can access certain routes
 */
export default class AdminMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await ctx.auth.check()

    const user = ctx.auth.getUserOrFail()

    if (user.userType !== 'admin' || !user.currentAccessToken?.allows('client:admin_app')) {
      throw new DomainException('Access denied. Admin privileges required.', 403, 'ADMIN_REQUIRED')
    }

    return next()
  }
}
