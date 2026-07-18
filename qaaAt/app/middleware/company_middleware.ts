import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import companyContextService, { type CompanyContext } from '#services/company_context_service'
import CompanyMembershipException from '#exceptions/company_membership_exception'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    companyContext: CompanyContext
  }
}

/** Resolves the company tenant exclusively from an explicitly scoped access token. */
export default class CompanyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await ctx.auth.check()

    const user = ctx.auth.getUserOrFail()

    const token = user.currentAccessToken
    if (!token?.allows('client:company_app')) {
      throw new CompanyMembershipException(
        'A company application token is required',
        'COMPANY_TOKEN_REQUIRED',
        403
      )
    }

    const companyAbilities = token.abilities.filter((ability) => ability.startsWith('company:'))
    const companyId = Number(companyAbilities[0]?.slice('company:'.length))
    if (companyAbilities.length !== 1 || !Number.isSafeInteger(companyId) || companyId <= 0) {
      throw new CompanyMembershipException(
        'A single valid company token scope is required',
        'COMPANY_SCOPE_REQUIRED',
        403
      )
    }

    ctx.companyContext = await companyContextService.resolve(user.id, companyId)
    return next()
  }
}
