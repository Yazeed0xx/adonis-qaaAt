import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Verified email middleware ensures only users with verified email can access certain routes
 */
export default class VerifiedEmailMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.getUserOrFail()

    if (!user.emailVerifiedAt) {
      return ctx.response.forbidden({
        message: 'Please verify your email address before proceeding.',
        code: 'EMAIL_NOT_VERIFIED',
      })
    }

    return next()
  }
}
