import type { HttpContext } from '@adonisjs/core/http'
import BookingNotFoundException from '#exceptions/booking_not_found_exception'
import Company from '#models/company'
import bookingManagementService from '#services/booking_management_service'
import { rejectBookingValidator } from '#validators/booking_validator'
import Booking from '#models/booking'
import BookingTransformer from '#transformers/booking_transformer'
import CompanyNotFoundException from '#exceptions/company_not_found_exception'

export default class CompanyBookingController {
  /**
   * Get company's company from user
   */
  private async getCompany(userId: number): Promise<Company> {
    const company = await Company.query().where('userId', userId).whereNull('deletedAt').first()
    if (!company) {
      throw new CompanyNotFoundException()
    }
    return company
  }

  /**
   * List all bookings for company's halls
   */
  async index({ auth, request, serialize }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const company = await this.getCompany(user.id)

    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))
    const status = request.input('status')

    const bookings = await bookingManagementService.getCompanyBookings(company.id, page, limit, status)

    return serialize(BookingTransformer.paginate(bookings.all(), bookings.getMeta()))
  }

  /**
   * List pending bookings that need response
   */
  async pending({ auth, request, serialize }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const company = await this.getCompany(user.id)

    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const bookings = await bookingManagementService.getPendingCompanyBookings(company.id, page, limit)

    return serialize(BookingTransformer.paginate(bookings.all(), bookings.getMeta()))
  }

  /**
   * Get a single booking
   */
  async show({ auth, params, serialize }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const company = await this.getCompany(user.id)

    const booking = await Booking.query()
      .where('id', params.id)
      .whereNull('deletedAt')
      .whereHas('hall', (query) => {
        query.where('companyId', company.id)
      })
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
  async accept({ auth, params, response, serialize }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const company = await this.getCompany(user.id)

    const booking = await bookingManagementService.acceptBooking(params.id, company.id)

    return response.ok({
      message: 'Booking accepted successfully. The customer will be notified to proceed with payment.',
      data: await serialize.withoutWrapping(BookingTransformer.transform(booking)),
    })
  }

  /**
   * Reject a booking
   */
  async reject({ auth, params, request, response, serialize }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const payload = await request.validateUsing(rejectBookingValidator)

    const company = await this.getCompany(user.id)

    const booking = await bookingManagementService.rejectBooking(params.id, company.id, payload.reason)

    return response.ok({
      message: 'Booking rejected. The customer will be notified.',
      data: await serialize.withoutWrapping(BookingTransformer.transform(booking)),
    })
  }
}
