import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * User type middleware ensures only regular users can access certain routes
 */
export default class UserTypeMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.getUserOrFail()

    if (user.userType !== 'user') {
      return ctx.response.forbidden({
        message: 'Access denied. User account required.',
      })
    }

    return next()
  }
}
