import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Company middleware ensures only company users can access certain routes
 */
export default class CompanyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await ctx.auth.check()

    const user = ctx.auth.getUserOrFail()

    if (user.userType !== 'company') {
      return ctx.response.forbidden({
        message: 'Access denied. Company account required.',
      })
    }

    return next()
  }
}
