import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { SpaceCatalogService } from '#services/space_catalog_service'
import SpaceTransformer from '#transformers/space_transformer'
@inject()
export default class PublicSpacesController {
  constructor(private catalog: SpaceCatalogService) {}
  async show({ params, serialize }: HttpContext) {
    return serialize(SpaceTransformer.transform(await this.catalog.publicShow(Number(params.id))))
  }
}
