import type { HttpContext } from '@adonisjs/core/http'
import companyContextService from '#services/company_context_service'
import pricingQuotes from '#services/pricing_quote_service'
import {
  createQuoteValidator,
  quoteActionValidator,
  sendQuoteValidator,
  updateQuoteValidator,
} from '#validators/pricing_quote_validator'

const paging = (request: HttpContext['request']) => ({
  page: Math.max(1, Number(request.input('page', 1)) || 1),
  limit: Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20)),
})

export default class CompanyQuotesController {
  async index({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'quotes.view')
    const p = paging(request)
    const rows = await pricingQuotes.listQuotes(
      'company',
      companyContext.companyId,
      p.page,
      p.limit
    )
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async show({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'quotes.view')
    return response.ok({
      data: await pricingQuotes.detail(
        undefined,
        companyContext.companyId,
        Number(params.id),
        true
      ),
    })
  }
  async store({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'quotes.manage')
    return response.created({
      data: await pricingQuotes.createQuote(
        companyContext.companyId,
        companyContext.membership.id,
        await request.validateUsing(createQuoteValidator)
      ),
    })
  }
  async update({ companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'quotes.manage')
    return response.ok({
      data: await pricingQuotes.updateQuote(
        companyContext.companyId,
        companyContext.membership.id,
        Number(params.id),
        await request.validateUsing(updateQuoteValidator)
      ),
    })
  }
  async send({ companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'quotes.manage')
    const input = await request.validateUsing(sendQuoteValidator)
    return response.ok({
      data: await pricingQuotes.sendQuote(
        companyContext.companyId,
        companyContext.membership.id,
        Number(params.id),
        input.expiresInHours
      ),
    })
  }
  async withdraw({ companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'quotes.manage')
    const input = await request.validateUsing(quoteActionValidator)
    return response.ok({
      data: await pricingQuotes.withdraw(
        companyContext.companyId,
        companyContext.membership.id,
        Number(params.id),
        input.reason
      ),
    })
  }
}
