import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import bookingManagementService from '#services/booking_management_service'
import { createBookingValidator } from '#validators/booking_validator'
import Booking from '#models/booking'

export default class UserBookingController {
  /**
   * List user's bookings
   */
  async index({ auth, request, response }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))
    const status = request.input('status')

    const bookings = await bookingManagementService.getUserBookings(user.id, page, limit, status)

    return response.ok(bookings)
  }

  /**
   * Create a new booking
   */
  async store({ auth, request, response }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const payload = await request.validateUsing(createBookingValidator)

    try {
      const booking = await bookingManagementService.createBooking(user.id, {
        hallId: payload.hallId,
        bookingDate: DateTime.fromISO(payload.bookingDate),
        startTime: payload.startTime,
        endTime: payload.endTime,
        serviceIds: payload.serviceIds,
        specialRequests: payload.specialRequests,
      })

      // Load relationships for response
      await booking.load('hall', (query) => {
        query.preload('company', (companyQuery) => {
          companyQuery.preload('companyProfile')
        })
      })
      await booking.load('services')

      return response.created({
        message: 'Booking request submitted successfully. The company has 7 days to respond.',
        booking,
      })
    } catch (error: unknown) {
      return response.badRequest({
        message: error instanceof Error ? error.message : 'Failed to create booking',
      })
    }
  }

  /**
   * Get a single booking
   */
  async show({ auth, params, response }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const booking = await Booking.query()
      .where('id', params.id)
      .where('userId', user.id)
      .preload('hall', (query) => {
        query.preload('company', (companyQuery) => {
          companyQuery.preload('companyProfile')
        })
      })
      .preload('services')
      .first()

    if (!booking) {
      return response.notFound({
        message: 'Booking not found',
      })
    }

    return response.ok(booking)
  }

  /**
   * Cancel a booking
   */
  async cancel({ auth, params, response }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    try {
      const booking = await bookingManagementService.cancelBooking(params.id, user.id)

      return response.ok({
        message: 'Booking cancelled successfully',
        booking: {
          id: booking.id,
          status: booking.status,
        },
      })
    } catch (error: unknown) {
      return response.badRequest({
        message: error instanceof Error ? error.message : 'Failed to cancel booking',
      })
    }
  }
}
