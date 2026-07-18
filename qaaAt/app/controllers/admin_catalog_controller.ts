import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { AdminCatalogService } from '#services/admin_catalog_service'
import {
  serializeAdminAmenity,
  serializeAdminCategory,
} from '#transformers/admin_operation_transformer'
import {
  adminCatalogCreateAmenityValidator,
  adminCatalogUpdateAmenityValidator,
  adminCatalogUpdateCategoryValidator,
  adminResourceParamsValidator,
} from '#validators/admin_operation_validator'

@inject()
export default class AdminCatalogController {
  constructor(private catalog: AdminCatalogService) {}

  async index({ response }: HttpContext) {
    const catalog = await this.catalog.list()
    return response.ok({
      data: {
        categories: catalog.categories.map(serializeAdminCategory),
        amenities: catalog.amenities.map(serializeAdminAmenity),
      },
    })
  }

  async updateCategory({ auth, params, request, response }: HttpContext) {
    const { id } = await request.validateUsing(adminResourceParamsValidator, { data: params })
    const input = await request.validateUsing(adminCatalogUpdateCategoryValidator)
    return response.ok({
      data: serializeAdminCategory(
        await this.catalog.updateCategory(auth.getUserOrFail().id, id, input)
      ),
    })
  }

  async createAmenity({ auth, request, response }: HttpContext) {
    const input = await request.validateUsing(adminCatalogCreateAmenityValidator)
    return response.created({
      data: serializeAdminAmenity(await this.catalog.createAmenity(auth.getUserOrFail().id, input)),
    })
  }

  async updateAmenity({ auth, params, request, response }: HttpContext) {
    const { id } = await request.validateUsing(adminResourceParamsValidator, { data: params })
    const input = await request.validateUsing(adminCatalogUpdateAmenityValidator)
    return response.ok({
      data: serializeAdminAmenity(
        await this.catalog.updateAmenity(auth.getUserOrFail().id, id, input)
      ),
    })
  }
}
