import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Booking from '#models/booking'
import BookingNotFoundException from '#exceptions/booking_not_found_exception'
import ForbiddenActionException from '#exceptions/forbidden_action_exception'
import InvalidStateException from '#exceptions/invalid_state_exception'
import bookingStatusService from '#services/booking_status_service'
import bookingAuditService from '#services/booking_audit_service'
import notificationOutboxService from '#services/notification_outbox_service'
import inventoryService from '#services/inventory_service'
import { companyNotificationRecipients } from '#services/company_notification_recipients_service'

export class BookingManagementService {
  private async financeRecipients(client: any, companyId: number) {
    return companyNotificationRecipients(client, companyId, 'finance.view')
  }

  /**
   * Accept a booking (company action)
   */
  async acceptBooking(bookingId: number, companyId: number, actorUserId: number): Promise<Booking> {
    const booking = await db.transaction(async (trx) => {
      const lockedBooking = await Booking.query({ client: trx })
        .where('id', bookingId)
        .whereNull('deletedAt')
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
          metadata: { spaceId: lockedBooking.spaceId, userId: lockedBooking.userId },
        },
        trx
      )

      await notificationOutboxService.enqueue(
        {
          userId: lockedBooking.userId,
          clientContext: 'customer_app',
          type: 'booking_accepted',
          title: 'Booking Confirmed',
          message: `Great news! Your booking for "${lockedBooking.spaceNameSnapshotAr ?? lockedBooking.spaceNameSnapshotEn ?? 'Space'}" on ${lockedBooking.bookingDate.toFormat('yyyy-MM-dd')} has been accepted. Please proceed with payment to secure your reservation.`,
          data: {
            bookingId: lockedBooking.id,
            spaceName: lockedBooking.spaceNameSnapshotAr ?? lockedBooking.spaceNameSnapshotEn,
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
          metadata: { spaceId: lockedBooking.spaceId, userId: lockedBooking.userId },
        },
        trx
      )

      await notificationOutboxService.enqueue(
        {
          userId: lockedBooking.userId,
          clientContext: 'customer_app',
          type: 'booking_rejected',
          title: 'Booking Rejected',
          message: `Unfortunately, your booking for "${lockedBooking.spaceNameSnapshotAr ?? lockedBooking.spaceNameSnapshotEn ?? 'Space'}" on ${lockedBooking.bookingDate.toFormat('yyyy-MM-dd')} was rejected. Reason: ${reason}`,
          data: {
            bookingId: lockedBooking.id,
            spaceName: lockedBooking.spaceNameSnapshotAr ?? lockedBooking.spaceNameSnapshotEn,
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

      if (!booking.companyId)
        throw new InvalidStateException('Booking has no company owner', 'BOOKING_COMPANY_REQUIRED')
      const companyId = booking.companyId
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
          clientContext: 'customer_app',
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
   * Expire old pending bookings (to be called by cron job)
   */
  async expireOldBookings(): Promise<number> {
    const expiredBookings = await Booking.query()
      .where('status', 'pending')
      .where('expiresAt', '<', DateTime.now().toSQL())

    let count = 0
    for (const expiredBooking of expiredBookings) {
      const booking = await db.transaction(async (trx) => {
        const lockedBooking = await Booking.query({ client: trx })
          .where('id', expiredBooking.id)
          .whereNull('deletedAt')
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
            clientContext: 'customer_app',
            type: 'booking_expired',
            title: 'Booking Request Expired',
            message: `Your booking request for "${lockedBooking.spaceNameSnapshotAr ?? lockedBooking.spaceNameSnapshotEn ?? 'Space'}" on ${lockedBooking.bookingDate.toFormat('yyyy-MM-dd')} has expired because the company did not respond in time.`,
            data: {
              bookingId: lockedBooking.id,
              spaceName: lockedBooking.spaceNameSnapshotAr ?? lockedBooking.spaceNameSnapshotEn,
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
              clientContext: 'customer_app',
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
                clientContext: 'company_app',
                companyId: hold.company_id,
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
