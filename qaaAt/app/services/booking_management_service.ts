import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Booking from '#models/booking'
import Hall from '#models/hall'
import Service from '#models/service'
import BookingConflictException from '#exceptions/booking_conflict_exception'
import BookingNotFoundException from '#exceptions/booking_not_found_exception'
import ForbiddenActionException from '#exceptions/forbidden_action_exception'
import InvalidInputException from '#exceptions/invalid_input_exception'
import InvalidStateException from '#exceptions/invalid_state_exception'
import HallNotFoundException from '#exceptions/hall_not_found_exception'
import { fromDatabaseAmount, sumDatabaseAmounts, toDatabaseAmount } from '#lib/money'
import bookingStatusService from '#services/booking_status_service'
import bookingAuditService from '#services/booking_audit_service'
import notificationOutboxService from '#services/notification_outbox_service'
import inventoryService from '#services/inventory_service'
import availabilityService from '#services/availability_service'
import { resolvePermissions, type CompanyRole } from '#lib/company_permissions'

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

  private async financeRecipients(client: any, companyId: number) {
    const members = await client
      .from('company_memberships')
      .where({ company_id: companyId, status: 'active' })
    const overrides = members.length
      ? await client.from('company_membership_permissions').whereIn(
          'company_membership_id',
          members.map((member: any) => member.id)
        )
      : []
    return members
      .filter((member: any) =>
        resolvePermissions(
          member.role as CompanyRole,
          overrides
            .filter((item: any) => item.company_membership_id === member.id)
            .map((item: any) => ({ permission: item.permission, effect: item.effect }))
        ).includes('finance.view')
      )
      .map((member: any) => member.user_id)
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

    const { booking } = await db.transaction(async (trx) => {
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

      const policyResult = await inventoryService.assertBookingRequestFitsPolicy(trx, {
        hallId: data.hallId,
        companyId: availableHall.companyId,
        bookingDate: data.bookingDate,
        startTime: data.startTime,
        endTime: data.endTime,
      })

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
          companyId: availableHall.companyId,
          venueId: policyResult.space.venue_id,
          spaceId: policyResult.space.id,
          requestReference: `LEG-${crypto.randomUUID()}`,
          requestSource: 'legacy_hall_api',
          spaceNameSnapshotEn: availableHall.name,
          venueNameSnapshotEn: policyResult.space.venue_name_en ?? null,
          customerEmailSnapshot: null,
          contactPreference: 'in_app',
          startsAt: policyResult.start.toUTC(),
          endsAt: policyResult.end.toUTC(),
          originalStartLocal: policyResult.start.toISO({ includeOffset: false }),
          originalEndLocal: policyResult.end.toISO({ includeOffset: false }),
          originalTimezone: policyResult.start.zoneName,
          submittedAt: DateTime.now(),
          responseExpiresAt: DateTime.now().plus({ days: BookingManagementService.EXPIRY_DAYS }),
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

      if (availableHall.company?.user) {
        await notificationOutboxService.enqueue(
          {
            userId: availableHall.company.user.id,
            type: 'new_booking_request',
            title: 'New Booking Request',
            message: `You have a new booking request from A customer for "${availableHall.name}" on ${data.bookingDate.toFormat('yyyy-MM-dd')}. Please review and respond within 7 days.`,
            data: {
              bookingId: createdBooking.id,
              hallName: availableHall.name,
              bookingDate: data.bookingDate.toFormat('yyyy-MM-dd'),
              userName: 'A customer',
            },
            sendEmail: true,
            emailSubject: 'New Booking Request - QaaAt',
          },
          trx
        )
      }

      return { booking: createdBooking, hall: availableHall }
    })

    return booking
  }

  /**
   * Get available time slots for a hall on a specific date
   */
  async getAvailability(hallId: number, date: DateTime): Promise<TimeSlot[]> {
    return availabilityService.legacyHallAvailability(hallId, date)
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
        .preload('hall')
        .preload('user')
        .forUpdate()
        .first()

      if (!lockedBooking) {
        throw new BookingNotFoundException()
      }

      if (lockedBooking.companyId !== companyId) {
        throw new ForbiddenActionException('This booking does not belong to your company')
      }

      const previousStatus = lockedBooking.status
      bookingStatusService.assertTransition(previousStatus, 'accepted')

      if (lockedBooking.isExpired) {
        throw new InvalidStateException('Cannot accept expired booking', 'BOOKING_EXPIRED')
      }

      const paymentDueDate = DateTime.now().plus({ days: 3 })
      await inventoryService.createBookingHold(trx, lockedBooking, companyId, paymentDueDate)
      lockedBooking.useTransaction(trx)
      lockedBooking.status = 'accepted'
      lockedBooking.companyRespondedAt = DateTime.now()
      lockedBooking.paymentDueDate = paymentDueDate
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

      await notificationOutboxService.enqueue(
        {
          userId: lockedBooking.userId,
          type: 'booking_accepted',
          title: 'Booking Confirmed',
          message: `Great news! Your booking for "${lockedBooking.spaceNameSnapshotAr ?? lockedBooking.spaceNameSnapshotEn ?? lockedBooking.hall?.name ?? 'Space'}" on ${lockedBooking.bookingDate.toFormat('yyyy-MM-dd')} has been accepted. Please proceed with payment to secure your reservation.`,
          data: {
            bookingId: lockedBooking.id,
            hallName:
              lockedBooking.spaceNameSnapshotAr ??
              lockedBooking.spaceNameSnapshotEn ??
              lockedBooking.hall?.name,
            bookingDate: lockedBooking.bookingDate.toFormat('yyyy-MM-dd'),
          },
          sendEmail: true,
          emailSubject: 'Booking Confirmed - QaaAt',
        },
        trx
      )

      return lockedBooking
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
        .preload('hall')
        .preload('user')
        .forUpdate()
        .first()

      if (!lockedBooking) {
        throw new BookingNotFoundException()
      }

      if (lockedBooking.companyId !== companyId) {
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

      await notificationOutboxService.enqueue(
        {
          userId: lockedBooking.userId,
          type: 'booking_rejected',
          title: 'Booking Rejected',
          message: `Unfortunately, your booking for "${lockedBooking.spaceNameSnapshotAr ?? lockedBooking.spaceNameSnapshotEn ?? lockedBooking.hall?.name ?? 'Space'}" on ${lockedBooking.bookingDate.toFormat('yyyy-MM-dd')} was rejected. Reason: ${reason}`,
          data: {
            bookingId: lockedBooking.id,
            hallName:
              lockedBooking.spaceNameSnapshotAr ??
              lockedBooking.spaceNameSnapshotEn ??
              lockedBooking.hall?.name,
            bookingDate: lockedBooking.bookingDate.toFormat('yyyy-MM-dd'),
            reason,
          },
          sendEmail: true,
          emailSubject: 'Booking Update - QaaAt',
        },
        trx
      )

      return lockedBooking
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

      const payment = await trx
        .from('payments')
        .where('booking_id', booking.id)
        .orderBy('id')
        .forUpdate()
        .first()
      if (payment)
        await trx.from('payment_attempts').where('payment_id', payment.id).orderBy('id').forUpdate()
      if (booking.status === 'confirmed' && payment?.status === 'paid')
        throw new InvalidStateException(
          'Paid bookings must use the refund-aware cancellation workflow',
          'CANCELLATION_PAYMENT_FLOW_REQUIRED'
        )

      const previousStatusForCancellation = booking.status
      bookingStatusService.assertTransition(booking.status, 'cancelled')

      if (booking.status === 'accepted') {
        await inventoryService.releaseBookingHold(trx, booking.id, 'booking_cancelled', 'cancelled')
      }

      booking.useTransaction(trx)
      booking.status = 'cancelled'
      await booking.save()

      const legacyHall = booking.companyId
        ? null
        : await trx.from('halls').where('id', booking.hallId!).select('company_id').firstOrFail()
      const companyId = booking.companyId ?? legacyHall!.company_id
      await bookingAuditService.record(
        {
          actorUserId: userId,
          bookingId: booking.id,
          companyId,
          action: 'booking.cancel',
          previousStatus: previousStatusForCancellation,
          nextStatus: 'cancelled',
        },
        trx
      )

      return booking
    })
  }

  async cancelBookingByCompany(
    bookingId: number,
    companyId: number,
    actorUserId: number,
    reason: string
  ) {
    return db.transaction(async (trx) => {
      const booking = await Booking.query({ client: trx })
        .where('id', bookingId)
        .where('companyId', companyId)
        .whereNull('deletedAt')
        .forUpdate()
        .firstOrFail()
      const payment = await trx
        .from('payments')
        .where('booking_id', booking.id)
        .orderBy('id')
        .forUpdate()
        .first()
      if (payment)
        await trx.from('payment_attempts').where('payment_id', payment.id).orderBy('id').forUpdate()
      if (booking.status === 'confirmed' && payment?.status === 'paid')
        throw new InvalidStateException(
          'Paid bookings must use the refund-aware cancellation workflow',
          'CANCELLATION_PAYMENT_FLOW_REQUIRED'
        )
      bookingStatusService.assertTransition(booking.status, 'cancelled')
      const previousStatus = booking.status
      if (booking.status === 'accepted') {
        await inventoryService.releaseBookingHold(
          trx,
          booking.id,
          'provider_cancelled',
          'cancelled'
        )
      }
      booking.useTransaction(trx)
      booking.status = 'cancelled'
      await booking.save()
      await bookingAuditService.record(
        {
          actorUserId,
          bookingId: booking.id,
          companyId,
          action: 'booking.cancel',
          previousStatus,
          nextStatus: 'cancelled',
          reason,
        },
        trx
      )
      await notificationOutboxService.enqueue(
        {
          userId: booking.userId,
          type: 'booking_cancelled',
          title: 'تم إلغاء طلب الحجز',
          message: reason,
          data: { bookingId: booking.id, reason },
        },
        trx
      )
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
      .where('companyId', companyId)
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
      .where('companyId', companyId)
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

        await notificationOutboxService.enqueue(
          {
            userId: lockedBooking.userId,
            type: 'booking_expired',
            title: 'Booking Request Expired',
            message: `Your booking request for "${lockedBooking.spaceNameSnapshotAr ?? lockedBooking.spaceNameSnapshotEn ?? lockedBooking.hall?.name ?? 'Space'}" on ${lockedBooking.bookingDate.toFormat('yyyy-MM-dd')} has expired because the company did not respond in time.`,
            data: {
              bookingId: lockedBooking.id,
              hallName:
                lockedBooking.spaceNameSnapshotAr ??
                lockedBooking.spaceNameSnapshotEn ??
                lockedBooking.hall?.name,
              bookingDate: lockedBooking.bookingDate.toFormat('yyyy-MM-dd'),
            },
            sendEmail: true,
            emailSubject: 'Booking Request Expired - QaaAt',
          },
          trx
        )
        return lockedBooking
      })

      if (!booking) {
        continue
      }

      count++
    }

    return count + (await this.expirePaymentHolds())
  }

  async expirePaymentHolds(): Promise<number> {
    const candidates = await db
      .from('booking_holds')
      .where('status', 'active')
      .where('expires_at', '<=', DateTime.now().toSQL())
      .limit(100)
    let count = 0
    for (const candidate of candidates) {
      const expired = await db.transaction(async (trx) => {
        const booking = await Booking.query({ client: trx })
          .where('id', candidate.booking_id)
          .preload('hall', (query) => query.preload('company'))
          .forUpdate()
          .skipLocked()
          .first()
        if (!booking) return false
        const payment = await trx
          .from('payments')
          .where('booking_id', booking.id)
          .orderBy('id')
          .forUpdate()
          .first()
        if (payment)
          await trx
            .from('payment_attempts')
            .where('payment_id', payment.id)
            .orderBy('id')
            .forUpdate()
        const hold = await trx
          .from('booking_holds')
          .where('id', candidate.id)
          .where('status', 'active')
          .where('expires_at', '<=', DateTime.now().toSQL())
          .forUpdate()
          .skipLocked()
          .first()
        if (!hold) return false
        await inventoryService.releaseBookingHold(
          trx,
          booking.id,
          'payment_hold_expired',
          'expired'
        )
        if (booking.status === 'accepted') {
          bookingStatusService.assertTransition(booking.status, 'payment_expired')
          booking.useTransaction(trx)
          booking.status = 'payment_expired'
          await booking.save()
          await bookingAuditService.record(
            {
              actorUserId: null,
              bookingId: booking.id,
              companyId: hold.company_id,
              action: 'booking.payment_expired',
              previousStatus: 'accepted',
              nextStatus: 'payment_expired',
            },
            trx
          )
          await notificationOutboxService.enqueue(
            {
              userId: booking.userId,
              type: 'booking_expired',
              title: 'Payment window expired',
              message:
                'Your approved booking expired before payment and the inventory was released.',
              data: { bookingId: booking.id },
            },
            trx
          )
          for (const providerUserId of await this.financeRecipients(trx, hold.company_id))
            await notificationOutboxService.enqueue(
              {
                userId: providerUserId,
                type: 'booking_expired',
                title: 'Booking payment window expired',
                message: 'An accepted booking expired before payment and inventory was released.',
                data: { bookingId: booking.id },
              },
              trx
            )
        }
        return true
      })
      if (expired) count++
    }
    return count
  }
}

export default new BookingManagementService()
