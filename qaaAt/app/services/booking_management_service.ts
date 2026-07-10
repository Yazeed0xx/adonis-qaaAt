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
import bookingAuditService from '#services/booking_audit_service'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import logger from '@adonisjs/core/services/logger'
import type { QueuedNotificationData } from '#services/notification_service'

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

  private async dispatchNotification(payload: QueuedNotificationData): Promise<void> {
    try {
      await SendNotificationJob.dispatch(payload)
    } catch (error) {
      logger.error(
        { err: error, userId: payload.userId, type: payload.type },
        'Failed to dispatch post-commit notification'
      )
    }
  }

  /**
   * Create a new booking request
   */
  async createBooking(userId: number, data: CreateBookingData): Promise<Booking> {
    // Validate booking date is not in the past
    const today = DateTime.now().startOf('day')
    if (data.bookingDate < today) {
      throw new InvalidInputException(
        'Booking date must be today or in the future',
        'BOOKING_DATE_INVALID'
      )
    }

    // Validate endTime > startTime
    if (data.endTime <= data.startTime) {
      throw new InvalidInputException('End time must be after start time', 'BOOKING_TIME_INVALID')
    }

    const { booking, hall } = await db.transaction(async (trx) => {
      const slotLockKey = `${data.hallId}:${data.bookingDate.toFormat('yyyy-MM-dd')}`
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [slotLockKey])

      const availableHall = await Hall.query({ client: trx })
        .where('id', data.hallId)
        .whereNull('deletedAt')
        .whereHas('company', (companyQuery) => {
          companyQuery
            .where('status', 'approved')
            .whereNull('deletedAt')
            .whereHas('user', (userQuery) => userQuery.whereNull('deletedAt'))
        })
        .preload('company', (companyQuery) => companyQuery.preload('user'))
        .first()

      if (!availableHall) {
        throw new HallNotFoundException()
      }

      if (!availableHall.isAvailable) {
        throw new BookingConflictException('Hall is not available for booking', 'HALL_UNAVAILABLE')
      }

      const isAvailable = await this.checkTimeSlotAvailable(
        data.hallId,
        data.bookingDate,
        data.startTime,
        data.endTime,
        undefined,
        trx
      )

      if (!isAvailable) {
        throw new BookingConflictException(
          'The selected time slot is not available',
          'BOOKING_SLOT_UNAVAILABLE'
        )
      }

      const serviceIds = [...new Set(data.serviceIds ?? [])]
      const services = serviceIds.length
        ? await Service.query({ client: trx })
            .whereIn('id', serviceIds)
            .where('companyId', availableHall.companyId)
            .where('isActive', true)
            .whereNull('deletedAt')
        : []

      if (services.length !== serviceIds.length) {
        throw new BookingConflictException(
          'One or more selected services are not available for this hall',
          'BOOKING_SERVICE_UNAVAILABLE'
        )
      }

      const totalPrice = this.calculateTotalPrice(
        availableHall,
        data.startTime,
        data.endTime,
        services
      )

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

      if (services.length > 0) {
        createdBooking.useTransaction(trx)
        const pivotData: Record<number, { price_at_booking: string }> = {}
        services.forEach((service) => {
          pivotData[service.id] = { price_at_booking: service.price }
        })
        await createdBooking.related('services').attach(pivotData)
      }

      return { booking: createdBooking, hall: availableHall }
    })

    // Notify company of new booking request
    if (hall.company?.user) {
      await this.dispatchNotification({
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
    excludeBookingId?: number,
    client?: QueryClientContract
  ): Promise<boolean> {
    const query = (client ? Booking.query({ client }) : Booking.query())
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
  calculateTotalPrice(hall: Hall, startTime: string, endTime: string, services: Service[] = []) {
    // Calculate hours (accounting for minutes)
    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)
    const hours = (endHour * 60 + endMin - (startHour * 60 + startMin)) / 60

    // Hall price (pricing is per hour)
    let totalPrice = fromDatabaseAmount(hall.pricing) * hours

    // Add service prices
    if (services.length > 0) {
      totalPrice += sumDatabaseAmounts(services.map((service) => service.price))
    }

    return totalPrice
  }

  /**
   * Accept a booking (company action)
   */
  async acceptBooking(bookingId: number, companyId: number, actorUserId: number): Promise<Booking> {
    const booking = await db.transaction(async (trx) => {
      const lockedBooking = await Booking.query({ client: trx })
        .where('id', bookingId)
        .whereNull('deletedAt')
        .preload('hall', (query) => query.preload('company'))
        .preload('user')
        .forUpdate()
        .first()

      if (!lockedBooking) {
        throw new BookingNotFoundException()
      }

      if (lockedBooking.hall.companyId !== companyId) {
        throw new ForbiddenActionException('This booking does not belong to your company')
      }

      const previousStatus = lockedBooking.status
      bookingStatusService.assertTransition(previousStatus, 'accepted')

      if (lockedBooking.isExpired) {
        throw new InvalidStateException('Cannot accept expired booking', 'BOOKING_EXPIRED')
      }

      lockedBooking.useTransaction(trx)
      lockedBooking.status = 'accepted'
      lockedBooking.companyRespondedAt = DateTime.now()
      lockedBooking.paymentDueDate = DateTime.now().plus({ days: 3 })
      await lockedBooking.save()

      await bookingAuditService.record(
        {
          actorUserId,
          bookingId: lockedBooking.id,
          companyId,
          action: 'booking.accept',
          previousStatus,
          nextStatus: lockedBooking.status,
          metadata: { hallId: lockedBooking.hallId, userId: lockedBooking.userId },
        },
        trx
      )

      return lockedBooking
    })

    // Notify user
    await this.dispatchNotification({
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
  async rejectBooking(
    bookingId: number,
    companyId: number,
    actorUserId: number,
    reason: string
  ): Promise<Booking> {
    const booking = await db.transaction(async (trx) => {
      const lockedBooking = await Booking.query({ client: trx })
        .where('id', bookingId)
        .whereNull('deletedAt')
        .preload('hall', (query) => query.preload('company'))
        .preload('user')
        .forUpdate()
        .first()

      if (!lockedBooking) {
        throw new BookingNotFoundException()
      }

      if (lockedBooking.hall.companyId !== companyId) {
        throw new ForbiddenActionException('This booking does not belong to your company')
      }

      const previousStatus = lockedBooking.status
      bookingStatusService.assertTransition(previousStatus, 'rejected')

      if (lockedBooking.isExpired) {
        throw new InvalidStateException('Cannot reject expired booking', 'BOOKING_EXPIRED')
      }

      lockedBooking.useTransaction(trx)
      lockedBooking.status = 'rejected'
      lockedBooking.rejectionReason = reason
      lockedBooking.companyRespondedAt = DateTime.now()
      await lockedBooking.save()

      await bookingAuditService.record(
        {
          actorUserId,
          bookingId: lockedBooking.id,
          companyId,
          action: 'booking.reject',
          previousStatus,
          nextStatus: lockedBooking.status,
          reason,
          metadata: { hallId: lockedBooking.hallId, userId: lockedBooking.userId },
        },
        trx
      )

      return lockedBooking
    })

    // Notify user
    await this.dispatchNotification({
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
    return db.transaction(async (trx) => {
      const booking = await Booking.query({ client: trx })
        .where('id', bookingId)
        .where('userId', userId)
        .whereNull('deletedAt')
        .preload('hall')
        .forUpdate()
        .first()

      if (!booking) {
        throw new BookingNotFoundException()
      }

      bookingStatusService.assertTransition(booking.status, 'cancelled')

      booking.useTransaction(trx)
      booking.status = 'cancelled'
      await booking.save()

      return booking
    })
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
    for (const expiredBooking of expiredBookings) {
      const booking = await db.transaction(async (trx) => {
        const lockedBooking = await Booking.query({ client: trx })
          .where('id', expiredBooking.id)
          .whereNull('deletedAt')
          .preload('hall')
          .forUpdate()
          .first()

        if (
          !lockedBooking ||
          lockedBooking.status !== 'pending' ||
          !lockedBooking.expiresAt ||
          lockedBooking.expiresAt >= DateTime.now()
        ) {
          return null
        }

        bookingStatusService.assertTransition(lockedBooking.status, 'expired')
        lockedBooking.useTransaction(trx)
        lockedBooking.status = 'expired'
        await lockedBooking.save()
        return lockedBooking
      })

      if (!booking) {
        continue
      }

      // Notify user
      await this.dispatchNotification({
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
