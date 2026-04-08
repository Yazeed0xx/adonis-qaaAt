import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import BookingNotFoundException from '#exceptions/booking_not_found_exception'
import bookingManagementService from '#services/booking_management_service'
import { createBookingValidator } from '#validators/booking_validator'
import Booking from '#models/booking'
import BookingTransformer from '#transformers/booking_transformer'

export default class UserBookingController {
  /**
   * List user's bookings
   */
  async index({ auth, request, serialize }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))
    const status = request.input('status')

    const bookings = await bookingManagementService.getUserBookings(user.id, page, limit, status)

    return serialize(BookingTransformer.paginate(bookings.all(), bookings.getMeta()))
  }

  /**
   * Create a new booking
   */
  async store({ auth, request, response, serialize }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const payload = await request.validateUsing(createBookingValidator)

    const booking = await bookingManagementService.createBooking(user.id, {
      hallId: payload.hallId,
      bookingDate: DateTime.fromISO(payload.bookingDate),
      startTime: payload.startTime,
      endTime: payload.endTime,
      serviceIds: payload.serviceIds,
      specialRequests: payload.specialRequests,
    })

    await booking.load('hall', (query) => {
      query.preload('company', (companyQuery) => {
        companyQuery.preload('companyProfile')
      })
    })
    await booking.load('services')

    return response.created({
      message: 'Booking request submitted successfully. The company has 7 days to respond.',
      data: await serialize.withoutWrapping(BookingTransformer.transform(booking)),
    })
  }

  /**
   * Get a single booking
   */
  async show({ auth, params, serialize }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const booking = await Booking.query()
      .where('id', params.id)
      .where('userId', user.id)
      .whereNull('deletedAt')
      .preload('hall', (query) => {
        query.preload('company', (companyQuery) => {
          companyQuery.preload('companyProfile')
        })
      })
      .preload('services')
      .first()

    if (!booking) {
      throw new BookingNotFoundException()
    }

    return serialize(BookingTransformer.transform(booking))
  }

  /**
   * Cancel a booking
   */
  async cancel({ auth, params, response, serialize }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const booking = await bookingManagementService.cancelBooking(params.id, user.id)

    return response.ok({
      message: 'Booking cancelled successfully',
      data: await serialize.withoutWrapping(BookingTransformer.transform(booking)),
    })
  }
}
