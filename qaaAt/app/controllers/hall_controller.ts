import type { HttpContext } from '@adonisjs/core/http'
import { hallValidator } from '#validators/hall_validator'
import { HallService } from '#services/hall_service'
import apiSerializer from '#transformers/api_serializer'
import HallTransformer from '#transformers/hall_transformer'

export default class HallController {
  /**
   * Get all halls for the authenticated company
   */
  async index({ auth, request }: HttpContext) {
    const user = auth.getUserOrFail()
    const hallService = new HallService()
    const company = await hallService.getCompanyByUserId(user.id)
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const halls = await hallService.getAllHalls(company.id, page, limit)
    return apiSerializer.serialize(HallTransformer.paginate(halls.all(), halls.getMeta()))
  }

  /**
   * Get a single hall by ID
   */
  async show({ auth, params }: HttpContext) {
    const user = auth.getUserOrFail()
    const hallService = new HallService()
    const company = await hallService.getCompanyByUserId(user.id)

    const hall = await hallService.getHallById(Number(params.id), company.id)
    return apiSerializer.serialize(HallTransformer.transform(hall))
  }

  /**
   * Create a new hall
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const hallService = new HallService()
    const company = await hallService.getCompanyByUserId(user.id)
    const payload = await request.validateUsing(hallValidator)

    const hall = await hallService.createHall(company.id, payload)
    return response.created({
      message: 'Hall created successfully',
      hall: await apiSerializer.serializeWithoutWrapping(HallTransformer.transform(hall)),
    })
  }

  /**
   * Update a hall
   */
  async update({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const hallService = new HallService()
    const company = await hallService.getCompanyByUserId(user.id)
    const payload = await request.validateUsing(hallValidator)

    const hall = await hallService.updateHall(Number(params.id), company.id, payload)
    return response.ok({
      message: 'Hall updated successfully',
      hall: await apiSerializer.serializeWithoutWrapping(HallTransformer.transform(hall)),
    })
  }

  /**
   * Delete a hall
   */
  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const hallService = new HallService()
    const company = await hallService.getCompanyByUserId(user.id)

    await hallService.deleteHall(Number(params.id), company.id)
    return response.ok({
      message: 'Hall deleted successfully',
    })
  }
}
