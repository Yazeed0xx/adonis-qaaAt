import type { HttpContext } from '@adonisjs/core/http'
import Company from '#models/company'
import bookingManagementService from '#services/booking_management_service'
import { rejectBookingValidator } from '#validators/booking_validator'
import Booking from '#models/booking'
// test
export default class CompanyBookingController {
  /**
   * Get company's company from user
   */
  private async getCompany(userId: number): Promise<Company> {
    const company = await Company.findBy('userId', userId)
    if (!company) {
      throw new Error('Company not found')
    }
    return company
  }

  /**
   * List all bookings for company's halls
   */
  async index({ auth, request, response }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    try {
      const company = await this.getCompany(user.id)

      const page = Math.max(1, Number(request.input('page', 1)) || 1)
      const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))
      const status = request.input('status')

      const bookings = await bookingManagementService.getCompanyBookings(
        company.id,
        page,
        limit,
        status
      )

      return response.ok(bookings)
    } catch (error: unknown) {
      return response.badRequest({
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  /**
   * List pending bookings that need response
   */
  async pending({ auth, request, response }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    try {
      const company = await this.getCompany(user.id)

      const page = Math.max(1, Number(request.input('page', 1)) || 1)
      const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

      const bookings = await bookingManagementService.getPendingCompanyBookings(
        company.id,
        page,
        limit
      )

      return response.ok(bookings)
    } catch (error: unknown) {
      return response.badRequest({
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  /**
   * Get a single booking
   */
  async show({ auth, params, response }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    try {
      const company = await this.getCompany(user.id)

      const booking = await Booking.query()
        .where('id', params.id)
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
        return response.notFound({
          message: 'Booking not found',
        })
      }

      return response.ok(booking)
    } catch (error: unknown) {
      return response.badRequest({
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  /**
   * Accept a booking
   */
  async accept({ auth, params, response }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    try {
      const company = await this.getCompany(user.id)

      const booking = await bookingManagementService.acceptBooking(params.id, company.id)

      return response.ok({
        message:
          'Booking accepted successfully. The customer will be notified to proceed with payment.',
        booking: {
          id: booking.id,
          status: booking.status,
          paymentDueDate: booking.paymentDueDate,
        },
      })
    } catch (error: unknown) {
      return response.badRequest({
        message: error instanceof Error ? error.message : 'Failed to accept booking',
      })
    }
  }

  /**
   * Reject a booking
   */
  async reject({ auth, params, request, response }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const payload = await request.validateUsing(rejectBookingValidator)

    try {
      const company = await this.getCompany(user.id)

      const booking = await bookingManagementService.rejectBooking(
        params.id,
        company.id,
        payload.reason
      )

      return response.ok({
        message: 'Booking rejected. The customer will be notified.',
        booking: {
          id: booking.id,
          status: booking.status,
          rejectionReason: booking.rejectionReason,
        },
      })
    } catch (error: unknown) {
      return response.badRequest({
        message: error instanceof Error ? error.message : 'Failed to reject booking',
      })
    }
  }
}
