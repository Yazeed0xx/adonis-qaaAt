import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import Hall from '#models/hall'
import bookingManagementService from '#services/booking_management_service'

export default class PublicHallController {
  /**
   * Browse all available halls (public, no auth required)
   */
  async index({ request, response }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))
    const city = request.input('city')
    const minCapacity = request.input('min_capacity')
    const maxPrice = request.input('max_price')
    const search = request.input('search')

    const query = Hall.query()
      .where('isAvailable', true)
      .whereNull('deletedAt')
      .whereHas('company', (companyQuery) => {
        companyQuery.where('status', 'approved')
      })
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

    return response.ok(halls)
  }

  /**
   * Get a single hall by ID (public, no auth required)
   */
  async show({ params, response }: HttpContext) {
    const hall = await Hall.query()
      .where('id', params.id)
      .where('isAvailable', true)
      .whereNull('deletedAt')
      .whereHas('company', (companyQuery) => {
        companyQuery.where('status', 'approved')
      })
      .preload('company', (companyQuery) => {
        companyQuery.preload('companyProfile')
      })
      .first()

    if (!hall) {
      return response.notFound({
        message: 'Hall not found or not available',
      })
    }

    return response.ok(hall)
  }

  /**
   * Get hall availability for a specific date
   */
  async availability({ params, request, response }: HttpContext) {
    const dateStr = request.input('date')

    if (!dateStr) {
      return response.badRequest({
        message: 'Date parameter is required (format: YYYY-MM-DD)',
      })
    }

    const date = DateTime.fromISO(dateStr)

    if (!date.isValid) {
      return response.badRequest({
        message: 'Invalid date format. Use YYYY-MM-DD',
      })
    }

    // Check if date is in the past
    if (date < DateTime.now().startOf('day')) {
      return response.badRequest({
        message: 'Cannot check availability for past dates',
      })
    }

    // Verify hall exists and is available
    const hall = await Hall.query()
      .where('id', params.id)
      .where('isAvailable', true)
      .whereNull('deletedAt')
      .whereHas('company', (companyQuery) => {
        companyQuery.where('status', 'approved')
      })
      .first()

    if (!hall) {
      return response.notFound({
        message: 'Hall not found or not available',
      })
    }

    const slots = await bookingManagementService.getAvailability(hall.id, date)

    return response.ok({
      hallId: hall.id,
      hallName: hall.name,
      date: date.toFormat('yyyy-MM-dd'),
      slots,
    })
  }

  /**
   * Get list of cities with available halls
   */
  async cities({ response }: HttpContext) {
    const cities = await Hall.query()
      .where('isAvailable', true)
      .whereNull('deletedAt')
      .whereHas('company', (companyQuery) => {
        companyQuery.where('status', 'approved')
      })
      .select('city')
      .distinct('city')
      .orderBy('city', 'asc')

    return response.ok({
      cities: cities.map((h) => h.city),
    })
  }
}
