import type { HttpContext } from '@adonisjs/core/http'
import { hallValidator } from '#validators/hall_validator'
import { HallService } from '#services/hall_service'

export default class HallController {
  /**
   * Get all halls for the authenticated company
   */
  async index({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const hallService = new HallService()
    const company = await hallService.getCompanyByUserId(user.id)
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)

    const halls = await hallService.getAllHalls(company.id, page, limit)
    return response.ok(halls)
  }

  /**
   * Get a single hall by ID
   */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const hallService = new HallService()
    const company = await hallService.getCompanyByUserId(user.id)

    const hall = await hallService.getHallById(Number(params.id), company.id)
    return response.ok(hall)
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
      hall,
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
      hall,
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
