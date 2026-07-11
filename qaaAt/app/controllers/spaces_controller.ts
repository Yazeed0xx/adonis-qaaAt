import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { SpaceCatalogService } from '#services/space_catalog_service'
import companyContextService from '#services/company_context_service'
import { createSpaceValidator, updateSpaceValidator } from '#validators/space_validator'
import SpaceTransformer from '#transformers/space_transformer'

@inject()
export default class SpacesController {
  constructor(private catalog: SpaceCatalogService) {}
  async index({ companyContext, request, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.view')
    const spaces = await this.catalog.listSpaces(
      companyContext.companyId,
      Number(request.input('page', 1)),
      Math.min(100, Number(request.input('limit', 20)))
    )
    return serialize(SpaceTransformer.paginate(spaces.all(), spaces.getMeta()))
  }
  async show({ companyContext, params, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.view')
    return serialize(
      SpaceTransformer.transform(
        await this.catalog.getSpace(companyContext.companyId, Number(params.id))
      )
    )
  }
  async store({ auth, companyContext, request, response, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    const space = await this.catalog.createSpace(
      companyContext.companyId,
      auth.getUserOrFail().id,
      await request.validateUsing(createSpaceValidator)
    )
    return response.created({
      data: await serialize.withoutWrapping(SpaceTransformer.transform(space)),
    })
  }
  async update({ auth, companyContext, params, request, response, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    const space = await this.catalog.updateSpace(
      companyContext.companyId,
      auth.getUserOrFail().id,
      Number(params.id),
      await request.validateUsing(updateSpaceValidator)
    )
    return response.ok({ data: await serialize.withoutWrapping(SpaceTransformer.transform(space)) })
  }
  async submit({ auth, companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    const space = await this.catalog.submit(
      companyContext.companyId,
      auth.getUserOrFail().id,
      Number(params.id)
    )
    return response.ok({ data: { id: space.id, publicationStatus: space.publicationStatus } })
  }
  async destroy({ auth, companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    await this.catalog.archive(companyContext.companyId, auth.getUserOrFail().id, Number(params.id))
    return response.noContent()
  }
}
