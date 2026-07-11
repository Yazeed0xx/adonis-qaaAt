import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { SpaceCatalogService } from '#services/space_catalog_service'
import companyContextService from '#services/company_context_service'
import { createVenueValidator, updateVenueValidator } from '#validators/space_validator'
import VenueTransformer from '#transformers/venue_transformer'

@inject()
export default class VenuesController {
  constructor(private catalog: SpaceCatalogService) {}
  async index({ companyContext, request, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.view')
    const venues = await this.catalog.listVenues(
      companyContext.companyId,
      Number(request.input('page', 1)),
      Math.min(100, Number(request.input('limit', 20)))
    )
    return serialize(VenueTransformer.paginate(venues.all(), venues.getMeta()))
  }
  async show({ companyContext, params, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.view')
    return serialize(
      VenueTransformer.transform(
        await this.catalog.getVenue(companyContext.companyId, Number(params.id))
      )
    )
  }
  async store({ companyContext, request, response, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    const venue = await this.catalog.createVenue(
      companyContext.companyId,
      await request.validateUsing(createVenueValidator)
    )
    return response.created({
      data: await serialize.withoutWrapping(VenueTransformer.transform(venue)),
    })
  }
  async update({ companyContext, params, request, response, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    const venue = await this.catalog.updateVenue(
      companyContext.companyId,
      Number(params.id),
      await request.validateUsing(updateVenueValidator)
    )
    return response.ok({ data: await serialize.withoutWrapping(VenueTransformer.transform(venue)) })
  }
}
