import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import companyContextService, { type CompanyContext } from '#services/company_context_service'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    companyContext: CompanyContext
  }
}

/**
 * Company middleware ensures only company users can access certain routes
 */
export default class CompanyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await ctx.auth.check()

    const user = ctx.auth.getUserOrFail()

    const token = user.currentAccessToken
    const isCompanyToken = token?.allows('client:company_app')
    const isLegacyOwnerToken =
      !token?.abilities.some((ability) => ability.startsWith('client:')) &&
      user.userType === 'company'
    if (!isCompanyToken && !isLegacyOwnerToken) {
      return ctx.response.forbidden({
        message: 'Access denied. Company account required.',
      })
    }

    const companyAbility = token?.abilities.find((ability) => ability.startsWith('company:'))
    const companyId = companyAbility ? Number(companyAbility.slice('company:'.length)) : undefined
    ctx.companyContext = await companyContextService.resolve(user.id, companyId)
    return next()
  }
}
