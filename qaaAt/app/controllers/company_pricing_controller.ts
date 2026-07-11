import type { HttpContext } from '@adonisjs/core/http'
import companyContextService from '#services/company_context_service'
import pricingQuotes from '#services/pricing_quote_service'
import {
  attachServiceValidator,
  packageValidator,
  ratePlanValidator,
  serviceOptionValidator,
} from '#validators/pricing_quote_validator'

const paging = (request: HttpContext['request']) => ({
  page: Math.max(1, Number(request.input('page', 1)) || 1),
  limit: Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20)),
})

export default class CompanyPricingController {
  async ratePlans({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.view')
    const p = paging(request)
    const rows = await pricingQuotes.listRatePlans(companyContext.companyId, p.page, p.limit)
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async storeRatePlan({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.manage')
    return response.created({
      data: await pricingQuotes.saveRatePlan(
        companyContext.companyId,
        await request.validateUsing(ratePlanValidator)
      ),
    })
  }
  async updateRatePlan({ companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.manage')
    return response.ok({
      data: await pricingQuotes.saveRatePlan(
        companyContext.companyId,
        await request.validateUsing(ratePlanValidator),
        Number(params.id)
      ),
    })
  }
  async archiveRatePlan({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.manage')
    await pricingQuotes.archiveRatePlan(companyContext.companyId, Number(params.id))
    return response.noContent()
  }
  async services({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.view')
    const p = paging(request)
    const rows = await pricingQuotes.listServices(companyContext.companyId, p.page, p.limit)
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async storeService({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.manage')
    return response.created({
      data: await pricingQuotes.saveService(
        companyContext.companyId,
        await request.validateUsing(serviceOptionValidator)
      ),
    })
  }
  async updateService({ companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.manage')
    return response.ok({
      data: await pricingQuotes.saveService(
        companyContext.companyId,
        await request.validateUsing(serviceOptionValidator),
        Number(params.id)
      ),
    })
  }
  async archiveService({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.manage')
    await pricingQuotes.archiveService(companyContext.companyId, Number(params.id))
    return response.noContent()
  }
  async attachService({ companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.manage')
    return response.ok({
      data: await pricingQuotes.attachService(
        companyContext.companyId,
        Number(params.spaceId),
        await request.validateUsing(attachServiceValidator)
      ),
    })
  }
  async detachService({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.manage')
    await pricingQuotes.detachService(
      companyContext.companyId,
      Number(params.spaceId),
      Number(params.serviceId)
    )
    return response.noContent()
  }
  async packages({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.view')
    const p = paging(request)
    const rows = await pricingQuotes.listPackages(companyContext.companyId, p.page, p.limit)
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async storePackage({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.manage')
    return response.created({
      data: await pricingQuotes.savePackage(
        companyContext.companyId,
        await request.validateUsing(packageValidator)
      ),
    })
  }
  async updatePackage({ companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.manage')
    return response.ok({
      data: await pricingQuotes.savePackage(
        companyContext.companyId,
        await request.validateUsing(packageValidator),
        Number(params.id)
      ),
    })
  }
  async archivePackage({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'pricing.manage')
    await pricingQuotes.archivePackage(companyContext.companyId, Number(params.id))
    return response.noContent()
  }
}
