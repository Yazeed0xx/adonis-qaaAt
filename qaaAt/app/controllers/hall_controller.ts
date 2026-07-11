import type { HttpContext } from '@adonisjs/core/http'
import { createHallValidator, updateHallValidator } from '#validators/hall_validator'
import { HallService } from '#services/hall_service'
import HallTransformer from '#transformers/hall_transformer'
import companyContextService from '#services/company_context_service'

export default class HallController {
  /**
   * Get all halls for the authenticated company
   */
  async index({ companyContext, request, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.view')
    const hallService = new HallService()
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const halls = await hallService.getAllHalls(companyContext.companyId, page, limit)
    return serialize(HallTransformer.paginate(halls.all(), halls.getMeta()))
  }

  /**
   * Get a single hall by ID
   */
  async show({ companyContext, params, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.view')
    const hallService = new HallService()
    const hall = await hallService.getHallById(Number(params.id), companyContext.companyId)
    return serialize(HallTransformer.transform(hall))
  }

  /**
   * Create a new hall
   */
  async store({ companyContext, request, response, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    const hallService = new HallService()
    const payload = await request.validateUsing(createHallValidator)

    const hall = await hallService.createHall(companyContext.companyId, payload)
    return response.created({
      message: 'Hall created successfully',
      data: await serialize.withoutWrapping(HallTransformer.transform(hall)),
    })
  }

  /**
   * Update a hall
   */
  async update({ companyContext, params, request, response, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    const hallService = new HallService()
    const payload = await request.validateUsing(updateHallValidator)

    const hall = await hallService.updateHall(Number(params.id), companyContext.companyId, payload)
    return response.ok({
      message: 'Hall updated successfully',
      data: await serialize.withoutWrapping(HallTransformer.transform(hall)),
    })
  }

  /**
   * Delete a hall
   */
  async destroy({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    const hallService = new HallService()
    await hallService.deleteHall(Number(params.id), companyContext.companyId)
    return response.ok({
      message: 'Hall deleted successfully',
    })
  }
}
