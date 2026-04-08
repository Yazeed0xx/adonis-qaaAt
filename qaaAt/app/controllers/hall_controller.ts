import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiQuery, ApiResponse, ApiSchema } from '@foadonis/openapi/decorators'
import { createHallValidator, updateHallValidator } from '#validators/hall_validator'
import {
  HallDeleteResponseSchema,
  HallMutationResponseSchema,
  HallPaginatedResponseSchema,
  HallResourceResponseSchema,
} from '#schemas/hall_schema'
import { HallService } from '#services/hall_service'
import HallTransformer from '#transformers/hall_transformer'

export default class HallController {
  /**
   * Get all halls for the authenticated company
   */
  @ApiOperation({ summary: 'List company halls' })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiResponse({ type: HallPaginatedResponseSchema })
  async index({ auth, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const hallService = new HallService()
    const company = await hallService.getCompanyByUserId(user.id)
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const halls = await hallService.getAllHalls(company.id, page, limit)
    return serialize(HallTransformer.paginate(halls.all(), halls.getMeta()))
  }

  /**
   * Get a single hall by ID
   */
  @ApiOperation({ summary: 'Get company hall details' })
  @ApiResponse({ type: HallResourceResponseSchema })
  async show({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const hallService = new HallService()
    const company = await hallService.getCompanyByUserId(user.id)

    const hall = await hallService.getHallById(Number(params.id), company.id)
    return serialize(HallTransformer.transform(hall))
  }

  /**
   * Create a new hall
   */
  @ApiOperation({ summary: 'Create a hall' })
  @ApiSchema(createHallValidator)
  @ApiResponse({ type: HallMutationResponseSchema })
  async store({ auth, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const hallService = new HallService()
    const company = await hallService.getCompanyByUserId(user.id)
    const payload = await request.validateUsing(createHallValidator)

    const hall = await hallService.createHall(company.id, payload)
    return response.created({
      message: 'Hall created successfully',
      data: await serialize.withoutWrapping(HallTransformer.transform(hall)),
    })
  }

  /**
   * Update a hall
   */
  @ApiOperation({ summary: 'Update a hall' })
  @ApiSchema(updateHallValidator)
  @ApiResponse({ type: HallMutationResponseSchema })
  async update({ auth, params, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const hallService = new HallService()
    const company = await hallService.getCompanyByUserId(user.id)
    const payload = await request.validateUsing(updateHallValidator)

    const hall = await hallService.updateHall(Number(params.id), company.id, payload)
    return response.ok({
      message: 'Hall updated successfully',
      data: await serialize.withoutWrapping(HallTransformer.transform(hall)),
    })
  }

  /**
   * Delete a hall
   */
  @ApiOperation({ summary: 'Delete a hall' })
  @ApiResponse({ type: HallDeleteResponseSchema })
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
