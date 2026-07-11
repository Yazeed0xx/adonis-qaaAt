import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import pricingQuotes from '#services/pricing_quote_service'
export default class AdminQuotesController {
  async index({ request, response }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))
    const rows = await pricingQuotes.listQuotes('admin', 0, page, limit)
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async show({ params, response }: HttpContext) {
    const quote = await db.from('quotes').where('id', params.id).firstOrFail()
    return response.ok({
      data: await pricingQuotes.detail(db, quote.company_id, quote.id, true),
      events: await db.from('quote_events').where('quote_id', quote.id).orderBy('created_at'),
    })
  }
  async pricing({ request, response }: HttpContext) {
    const companyId = Number(request.input('companyId'))
    return response.ok({
      data: {
        ratePlans: await db.from('rate_plans').where('company_id', companyId),
        packages: await db.from('packages').where('company_id', companyId),
        serviceOptions: await db.from('service_options').where('company_id', companyId),
      },
    })
  }
}
