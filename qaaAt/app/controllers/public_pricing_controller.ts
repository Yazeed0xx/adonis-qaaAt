import type { HttpContext } from '@adonisjs/core/http'
import pricingQuotes from '#services/pricing_quote_service'
export default class PublicPricingController {
  async show({ params, response }: HttpContext) {
    return response.ok({ data: await pricingQuotes.publicPricing(Number(params.spaceId)) })
  }
}
