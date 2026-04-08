import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Booking from '#models/booking'
import Hall from '#models/hall'
import Service from '#models/service'
import SendNotificationJob from '#jobs/send_notification_job'
import BookingConflictException from '#exceptions/booking_conflict_exception'
import BookingNotFoundException from '#exceptions/booking_not_found_exception'
import ForbiddenActionException from '#exceptions/forbidden_action_exception'
import InvalidInputException from '#exceptions/invalid_input_exception'
import InvalidStateException from '#exceptions/invalid_state_exception'
import HallNotFoundException from '#exceptions/hall_not_found_exception'
import { fromDatabaseAmount, sumDatabaseAmounts, toDatabaseAmount } from '#lib/money'
import bookingStatusService from '#services/booking_status_service'

interface CreateBookingData {
  hallId: number
  bookingDate: DateTime
  startTime: string
  endTime: string
  serviceIds?: number[]
  specialRequests?: string
}

interface TimeSlot {
  startTime: string
  endTime: string
  isAvailable: boolean
}

export class BookingManagementService {
  private static EXPIRY_DAYS = 7

  /**
   * Create a new booking request
   */
  async createBooking(userId: number, data: CreateBookingData): Promise<Booking> {
    // Validate booking date is not in the past
    const today = DateTime.now().startOf('day')
    if (data.bookingDate < today) {
      throw new InvalidInputException('Booking date must be today or in the future', 'BOOKING_DATE_INVALID')
    }

    // Validate endTime > startTime
    if (data.endTime <= data.startTime) {
      throw new InvalidInputException('End time must be after start time', 'BOOKING_TIME_INVALID')
    }

    // Check if hall exists and is available
    const hall = await Hall.query()
      .where('id', data.hallId)
      .whereNull('deletedAt')
      .preload('company', (query) => query.preload('user'))
      .first()

    if (!hall) {
      throw new HallNotFoundException()
    }

    if (!hall.isAvailable) {
      throw new BookingConflictException('Hall is not available for booking', 'HALL_UNAVAILABLE')
    }

    // Check if the time slot is available
    const isAvailable = await this.checkTimeSlotAvailable(
      data.hallId,
      data.bookingDate,
      data.startTime,
      data.endTime
    )

    if (!isAvailable) {
      throw new BookingConflictException(
        'The selected time slot is not available',
        'BOOKING_SLOT_UNAVAILABLE'
      )
    }

    // Calculate total price
    const totalPrice = await this.calculateTotalPrice(
      hall,
      data.startTime,
      data.endTime,
      data.serviceIds
    )

    const booking = await db.transaction(async (trx) => {
      const createdBooking = await Booking.create(
        {
          userId,
          hallId: data.hallId,
          bookingDate: data.bookingDate,
          startTime: data.startTime,
          endTime: data.endTime,
          totalPrice: toDatabaseAmount(totalPrice),
          specialRequests: data.specialRequests || null,
          status: 'pending',
          paymentStatus: 'unpaid',
          expiresAt: DateTime.now().plus({ days: BookingManagementService.EXPIRY_DAYS }),
        },
        { client: trx }
      )

      if (data.serviceIds && data.serviceIds.length > 0) {
        const services = await Service.query({ client: trx })
          .whereIn('id', data.serviceIds)
          .where('companyId', hall.companyId)

        if (services.length !== data.serviceIds.length) {
          throw new BookingConflictException(
            'One or more selected services are not available for this hall',
            'BOOKING_SERVICE_UNAVAILABLE'
          )
        }

        createdBooking.useTransaction(trx)
        const pivotData: Record<number, { price_at_booking: string }> = {}
        services.forEach((service) => {
          pivotData[service.id] = { price_at_booking: service.price }
        })
        await createdBooking.related('services').attach(pivotData)
      }

      return createdBooking
    })

    // Notify company of new booking request
    if (hall.company?.user) {
      await SendNotificationJob.dispatch({
        userId: hall.company.user.id,
        type: 'new_booking_request',
        title: 'New Booking Request',
        message: `You have a new booking request from A customer for "${hall.name}" on ${data.bookingDate.toFormat('yyyy-MM-dd')}. Please review and respond within 7 days.`,
        data: {
          bookingId: booking.id,
          hallName: hall.name,
          bookingDate: data.bookingDate.toFormat('yyyy-MM-dd'),
          userName: 'A customer',
        },
        sendEmail: true,
        emailSubject: 'New Booking Request - QaaAt',
      })
    }

    return booking
  }

  /**
   * Check if a time slot is available for a hall
   */
  async checkTimeSlotAvailable(
    hallId: number,
    bookingDate: DateTime,
    startTime: string,
    endTime: string,
    excludeBookingId?: number
  ): Promise<boolean> {
    const query = Booking.query()
      .where('hallId', hallId)
      .where('bookingDate', bookingDate.toFormat('yyyy-MM-dd'))
      .whereNull('deletedAt')
      .whereIn('status', ['pending', 'accepted', 'confirmed']) // Only check non-cancelled bookings
      .where((builder) => {
        // Check for overlapping time slots
        builder.where((q) => {
          q.where('startTime', '<', endTime).where('endTime', '>', startTime)
        })
      })

    if (excludeBookingId) {
      query.whereNot('id', excludeBookingId)
    }

    const conflictingBookings = await query.first()

    return !conflictingBookings
  }

  /**
   * Get available time slots for a hall on a specific date
   */
  async getAvailability(hallId: number, date: DateTime): Promise<TimeSlot[]> {
    // Define available hours (e.g., 8 AM to 10 PM)
    const startHour = 8
    const endHour = 22
    const slotDurationHours = 2

    const slots: TimeSlot[] = []

    for (let hour = startHour; hour < endHour; hour += slotDurationHours) {
      const startTime = `${hour.toString().padStart(2, '0')}:00`
      const endTime = `${(hour + slotDurationHours).toString().padStart(2, '0')}:00`

      const isAvailable = await this.checkTimeSlotAvailable(hallId, date, startTime, endTime)

      slots.push({
        startTime,
        endTime,
        isAvailable,
      })
    }

    return slots
  }

  /**
   * Calculate total price for a booking
   */
  async calculateTotalPrice(
    hall: Hall,
    startTime: string,
    endTime: string,
    serviceIds?: number[]
  ): Promise<number> {
    // Calculate hours (accounting for minutes)
    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)
    const hours = (endHour * 60 + endMin - (startHour * 60 + startMin)) / 60

    // Hall price (pricing is per hour)
    let totalPrice = fromDatabaseAmount(hall.pricing) * hours

    // Add service prices
    if (serviceIds && serviceIds.length > 0) {
      const services = await Service.query().whereIn('id', serviceIds)
      totalPrice += sumDatabaseAmounts(services.map((service) => service.price))
    }

    return totalPrice
  }

  /**
   * Accept a booking (company action)
   */
  async acceptBooking(bookingId: number, companyId: number): Promise<Booking> {
    const booking = await Booking.query()
      .where('id', bookingId)
      .whereNull('deletedAt')
      .preload('hall', (query) => query.preload('company'))
      .preload('user')
      .first()

    if (!booking) {
      throw new BookingNotFoundException()
    }

    if (booking.hall.companyId !== companyId) {
      throw new ForbiddenActionException('This booking does not belong to your company')
    }

    bookingStatusService.assertTransition(booking.status, 'accepted')

    if (booking.isExpired) {
      throw new InvalidStateException('Cannot accept expired booking', 'BOOKING_EXPIRED')
    }

    booking.status = 'accepted'
    booking.companyRespondedAt = DateTime.now()
    // Set payment due date (e.g., 3 days from acceptance)
    booking.paymentDueDate = DateTime.now().plus({ days: 3 })
    await booking.save()

    // Notify user
    await SendNotificationJob.dispatch({
      userId: booking.userId,
      type: 'booking_accepted',
      title: 'Booking Confirmed',
      message: `Great news! Your booking for "${booking.hall.name}" on ${booking.bookingDate.toFormat('yyyy-MM-dd')} has been accepted. Please proceed with payment to secure your reservation.`,
      data: {
        bookingId: booking.id,
        hallName: booking.hall.name,
        bookingDate: booking.bookingDate.toFormat('yyyy-MM-dd'),
      },
      sendEmail: true,
      emailSubject: 'Booking Confirmed - QaaAt',
    })

    return booking
  }

  /**
   * Reject a booking (company action)
   */
  async rejectBooking(bookingId: number, companyId: number, reason: string): Promise<Booking> {
    const booking = await Booking.query()
      .where('id', bookingId)
      .whereNull('deletedAt')
      .preload('hall', (query) => query.preload('company'))
      .preload('user')
      .first()

    if (!booking) {
      throw new BookingNotFoundException()
    }

    if (booking.hall.companyId !== companyId) {
      throw new ForbiddenActionException('This booking does not belong to your company')
    }

    bookingStatusService.assertTransition(booking.status, 'rejected')

    booking.status = 'rejected'
    booking.rejectionReason = reason
    booking.companyRespondedAt = DateTime.now()
    await booking.save()

    // Notify user
    await SendNotificationJob.dispatch({
      userId: booking.userId,
      type: 'booking_rejected',
      title: 'Booking Rejected',
      message: `Unfortunately, your booking for "${booking.hall.name}" on ${booking.bookingDate.toFormat('yyyy-MM-dd')} was rejected. Reason: ${reason}`,
      data: {
        bookingId: booking.id,
        hallName: booking.hall.name,
        bookingDate: booking.bookingDate.toFormat('yyyy-MM-dd'),
        reason,
      },
      sendEmail: true,
      emailSubject: 'Booking Update - QaaAt',
    })

    return booking
  }

  /**
   * Cancel a booking (user action)
   */
  async cancelBooking(bookingId: number, userId: number): Promise<Booking> {
    const booking = await Booking.query()
      .where('id', bookingId)
      .where('userId', userId)
      .whereNull('deletedAt')
      .preload('hall')
      .first()

    if (!booking) {
      throw new BookingNotFoundException()
    }

    bookingStatusService.assertTransition(booking.status, 'cancelled')

    booking.status = 'cancelled'
    await booking.save()

    return booking
  }

  /**
   * Get user's bookings
   */
  async getUserBookings(userId: number, page: number = 1, limit: number = 20, status?: string) {
    const query = Booking.query()
      .where('userId', userId)
      .whereNull('deletedAt')
      .preload('hall', (q) => q.preload('company', (cq) => cq.preload('companyProfile')))
      .preload('services')
      .orderBy('createdAt', 'desc')

    if (status) {
      query.where('status', status)
    }

    return query.paginate(page, limit)
  }

  /**
   * Get company's bookings (for all halls)
   */
  async getCompanyBookings(
    companyId: number,
    page: number = 1,
    limit: number = 20,
    status?: string
  ) {
    const query = Booking.query()
      .whereHas('hall', (hallQuery) => {
        hallQuery.where('companyId', companyId)
      })
      .whereNull('deletedAt')
      .preload('hall')
      .preload('user')
      .preload('services')
      .orderBy('createdAt', 'desc')

    if (status) {
      query.where('status', status)
    }

    return query.paginate(page, limit)
  }

  /**
   * Get pending bookings for a company (needs response)
   */
  async getPendingCompanyBookings(companyId: number, page: number = 1, limit: number = 20) {
    return Booking.query()
      .where('status', 'pending')
      .where('expiresAt', '>', DateTime.now().toSQL())
      .whereHas('hall', (hallQuery) => {
        hallQuery.where('companyId', companyId)
      })
      .preload('hall')
      .preload('user')
      .preload('services')
      .orderBy('createdAt', 'asc') // Oldest first (needs response)
      .paginate(page, limit)
  }

  /**
   * Expire old pending bookings (to be called by cron job)
   */
  async expireOldBookings(): Promise<number> {
    const expiredBookings = await Booking.query()
      .where('status', 'pending')
      .where('expiresAt', '<', DateTime.now().toSQL())
      .preload('hall')

    let count = 0
    for (const booking of expiredBookings) {
      bookingStatusService.assertTransition(booking.status, 'expired')
      booking.status = 'expired'
      await booking.save()

      // Notify user
      await SendNotificationJob.dispatch({
        userId: booking.userId,
        type: 'booking_expired',
        title: 'Booking Request Expired',
        message: `Your booking request for "${booking.hall.name}" on ${booking.bookingDate.toFormat('yyyy-MM-dd')} has expired as the company did not respond within 7 days. Please try booking again or choose a different hall.`,
        data: {
          bookingId: booking.id,
          hallName: booking.hall.name,
          bookingDate: booking.bookingDate.toFormat('yyyy-MM-dd'),
        },
        sendEmail: true,
        emailSubject: 'Booking Request Expired - QaaAt',
      })

      count++
    }

    return count
  }
}

export default new BookingManagementService()
