import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { SpaceCatalogService } from '#services/space_catalog_service'
import SpaceTransformer from '#transformers/space_transformer'
import { spaceDiscoveryValidator } from '#validators/space_discovery_validator'
import { SpaceDiscoveryService } from '#services/space_discovery_service'
@inject()
export default class PublicSpacesController {
  constructor(
    private catalog: SpaceCatalogService,
    private discovery: SpaceDiscoveryService
  ) {}
  async index({ request, response }: HttpContext) {
    const input = await request.validateUsing(spaceDiscoveryValidator)
    return response.ok(await this.discovery.list(input))
  }
  async show({ params, serialize }: HttpContext) {
    return serialize(SpaceTransformer.transform(await this.catalog.publicShow(Number(params.id))))
  }
}
