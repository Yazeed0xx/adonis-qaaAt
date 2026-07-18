import type { HttpContext } from '@adonisjs/core/http'
import pricingQuotes from '#services/pricing_quote_service'
import { QuoteTransformer } from '#transformers/quote_transformer'
import { quoteActionValidator } from '#validators/pricing_quote_validator'

const paging = (request: HttpContext['request']) => ({
  page: Math.max(1, Number(request.input('page', 1)) || 1),
  limit: Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20)),
})
export default class UserQuotesController {
  async index({ auth, request, response }: HttpContext) {
    const p = paging(request)
    const rows = await pricingQuotes.listQuotes('user', auth.getUserOrFail().id, p.page, p.limit)
    return response.ok({
      data: QuoteTransformer.customerCollection(rows.all()),
      meta: rows.getMeta(),
    })
  }
  async show({ auth, params, response }: HttpContext) {
    return response.ok({
      data: QuoteTransformer.customer(
        await pricingQuotes.userDetail(auth.getUserOrFail().id, Number(params.id))
      ),
    })
  }
  async accept({ auth, params, request, response }: HttpContext) {
    const input = await request.validateUsing(quoteActionValidator)
    return response.ok({
      data: await pricingQuotes.acceptQuote(
        auth.getUserOrFail().id,
        Number(params.id),
        input.revisionId
      ),
    })
  }
  async decline({ auth, params, request, response }: HttpContext) {
    const input = await request.validateUsing(quoteActionValidator)
    return response.ok({
      data: await pricingQuotes.customerAction(
        auth.getUserOrFail().id,
        Number(params.id),
        'customer_declined',
        input.reason
      ),
    })
  }
}
