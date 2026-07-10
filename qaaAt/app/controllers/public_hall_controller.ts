import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import HallNotFoundException from '#exceptions/hall_not_found_exception'
import InvalidInputException from '#exceptions/invalid_input_exception'
import Hall from '#models/hall'
import bookingManagementService from '#services/booking_management_service'
import HallTransformer from '#transformers/hall_transformer'

export default class PublicHallController {
  /**
   * Browse all available halls (public, no auth required)
   */
  async index({ request, serialize }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))
    const city = request.input('city')
    const minCapacity = request.input('min_capacity')
    const maxPrice = request.input('max_price')
    const search = request.input('search')

    const query = Hall.query()
      .withScopes((scopes) => scopes.publiclyVisible())
      .preload('company', (companyQuery) => {
        companyQuery.preload('companyProfile')
      })
      .orderBy('createdAt', 'desc')

    // Apply filters
    if (city) {
      query.where('city', city)
    }

    if (minCapacity) {
      query.where('capacity', '>=', Number(minCapacity))
    }

    if (maxPrice) {
      query.where('pricing', '<=', Number(maxPrice))
    }

    if (search) {
      query.where((builder) => {
        builder
          .whereILike('name', `%${search}%`)
          .orWhereILike('description', `%${search}%`)
          .orWhereILike('location', `%${search}%`)
      })
    }

    const halls = await query.paginate(page, limit)

    return serialize(HallTransformer.paginate(halls.all(), halls.getMeta()))
  }

  /**
   * Get a single hall by ID (public, no auth required)
   */
  async show({ params, serialize }: HttpContext) {
    const hall = await Hall.query()
      .withScopes((scopes) => scopes.publiclyVisible())
      .where('id', params.id)
      .preload('company', (companyQuery) => {
        companyQuery.preload('companyProfile')
      })
      .first()

    if (!hall) {
      throw new HallNotFoundException()
    }

    return serialize(HallTransformer.transform(hall))
  }

  /**
   * Get hall availability for a specific date
   */
  async availability({ params, request, response }: HttpContext) {
    const dateStr = request.input('date')

    if (!dateStr) {
      throw new InvalidInputException(
        'Date parameter is required (format: YYYY-MM-DD)',
        'DATE_REQUIRED'
      )
    }

    const date = DateTime.fromISO(dateStr)

    if (!date.isValid) {
      throw new InvalidInputException('Invalid date format. Use YYYY-MM-DD', 'INVALID_DATE_FORMAT')
    }

    // Check if date is in the past
    if (date < DateTime.now().startOf('day')) {
      throw new InvalidInputException(
        'Cannot check availability for past dates',
        'PAST_DATE_NOT_ALLOWED'
      )
    }

    // Verify hall exists and is available
    const hall = await Hall.query()
      .withScopes((scopes) => scopes.publiclyVisible())
      .where('id', params.id)
      .first()

    if (!hall) {
      throw new HallNotFoundException()
    }

    const slots = await bookingManagementService.getAvailability(hall.id, date)

    return response.ok({
      data: {
        hallId: hall.id,
        hallName: hall.name,
        date: date.toFormat('yyyy-MM-dd'),
        slots,
      },
    })
  }

  /**
   * Get list of cities with available halls
   */
  async cities({ response }: HttpContext) {
    const cities = await Hall.query()
      .withScopes((scopes) => scopes.publiclyVisible())
      .select('city')
      .distinct('city')
      .orderBy('city', 'asc')

    return response.ok({
      data: {
        cities: cities.map((h) => h.city),
      },
    })
  }
}
