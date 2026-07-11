import type { HttpContext } from '@adonisjs/core/http'
import BookingNotFoundException from '#exceptions/booking_not_found_exception'
import bookingManagementService from '#services/booking_management_service'
import { rejectBookingValidator } from '#validators/booking_validator'
import Booking from '#models/booking'
import BookingTransformer from '#transformers/booking_transformer'
import companyContextService from '#services/company_context_service'

export default class CompanyBookingController {
  /**
   * Get company's company from user
   */
  /**
   * List all bookings for company's halls
   */
  async index({ companyContext, request, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'bookings.view')

    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))
    const status = request.input('status')

    const bookings = await bookingManagementService.getCompanyBookings(
      companyContext.companyId,
      page,
      limit,
      status
    )

    return serialize(BookingTransformer.paginate(bookings.all(), bookings.getMeta()))
  }

  /**
   * List pending bookings that need response
   */
  async pending({ companyContext, request, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'booking_requests.view')

    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const bookings = await bookingManagementService.getPendingCompanyBookings(
      companyContext.companyId,
      page,
      limit
    )

    return serialize(BookingTransformer.paginate(bookings.all(), bookings.getMeta()))
  }

  /**
   * Get a single booking
   */
  async show({ companyContext, params, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'bookings.view')

    const booking = await Booking.query()
      .where('id', params.id)
      .where('companyId', companyContext.companyId)
      .whereNull('deletedAt')
      .preload('hall')
      .preload('user', (query) => {
        query.preload('userProfile')
      })
      .preload('services')
      .first()

    if (!booking) {
      throw new BookingNotFoundException()
    }

    return serialize(BookingTransformer.transform(booking))
  }

  /**
   * Accept a booking
   */
  async accept({ auth, companyContext, params, response, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'booking_requests.manage')
    await auth.check()
    const user = auth.getUserOrFail()

    const booking = await bookingManagementService.acceptBooking(
      params.id,
      companyContext.companyId,
      user.id
    )

    return response.ok({
      message:
        'Booking accepted successfully. The customer will be notified to proceed with payment.',
      data: await serialize.withoutWrapping(BookingTransformer.transform(booking)),
    })
  }

  /**
   * Reject a booking
   */
  async reject({ auth, companyContext, params, request, response, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'booking_requests.manage')
    await auth.check()
    const user = auth.getUserOrFail()

    const payload = await request.validateUsing(rejectBookingValidator)

    const booking = await bookingManagementService.rejectBooking(
      params.id,
      companyContext.companyId,
      user.id,
      payload.reason
    )

    return response.ok({
      message: 'Booking rejected. The customer will be notified.',
      data: await serialize.withoutWrapping(BookingTransformer.transform(booking)),
    })
  }
}
