import { DateTime } from 'luxon'
import SendMailJob from '#jobs/send_mail_job'
import Notification from '#models/notification'
import User from '#models/user'
import env from '#start/env'
import { escapeHtml } from '#lib/escape_html'
import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

export type NotificationType =
  | 'email_verified'
  | 'company_approved'
  | 'company_rejected'
  | 'booking_created'
  | 'booking_accepted'
  | 'booking_rejected'
  | 'booking_cancelled'
  | 'booking_expired'
  | 'new_booking_request'
  | 'company_invitation'
  | 'date_inquiry_received'
  | 'date_inquiry_answered'
  | 'date_inquiry_cancelled'
  | 'date_inquiry_expired'
  | 'visit_requested'
  | 'visit_confirmed'
  | 'visit_rejected'
  | 'visit_cancelled'
  | 'visit_completed'
  | 'visit_no_show'
  | 'visit_expired'
  | 'visit_alternative_proposed'
  | 'visit_alternative_accepted'
  | 'visit_alternative_rejected'
  | 'quote_sent'
  | 'quote_accepted'
  | 'quote_declined'
  | 'quote_withdrawn'
  | 'quote_expired'
  | 'payment_initiated'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'refund_requested'
  | 'refund_succeeded'
  | 'refund_failed'
  | 'reconciliation_required'

export interface NotificationData {
  userId?: number
  companyId?: number
  recipientEmail?: string
  type: NotificationType
  title: string
  message: string
  data?: Record<string, any>
  sendEmail?: boolean
  emailSubject?: string
  outboxId?: string
}

export type NotificationClientContext = 'customer_app' | 'company_app'

export type QueuedNotificationData = NotificationData &
  (
    | { clientContext: 'company_app'; companyId: number }
    | { clientContext: 'customer_app'; companyId?: never }
    | { clientContext?: undefined; companyId?: never }
  )

export class NotificationService {
  /**
   * Create an in-app notification
   */
  async notify(options: NotificationData): Promise<Notification> {
    const notification = await this.persist(options)
    await this.dispatchEmail(options)
    return notification
  }

  async persist(options: NotificationData, client?: QueryClientContract): Promise<Notification> {
    const queryClient = client ?? db.connection()
    if (!options.userId) throw new Error('userId is required for in-app notification persistence')
    let notification: Notification
    if (options.outboxId) {
      await queryClient
        .table('notifications')
        .insert({
          user_id: options.userId,
          company_id: options.companyId ?? null,
          type: options.type,
          title: options.title,
          message: options.message,
          data: options.data || null,
          outbox_id: options.outboxId,
          created_at: DateTime.now().toSQL(),
        })
        .onConflict('outbox_id')
        .ignore()
      const row = await queryClient
        .from('notifications')
        .where('outbox_id', options.outboxId)
        .firstOrFail()
      notification = await Notification.query({ client: queryClient })
        .where('id', row.id)
        .firstOrFail()
    } else {
      notification = await Notification.create(
        {
          userId: options.userId,
          companyId: options.companyId ?? null,
          type: options.type,
          title: options.title,
          message: options.message,
          data: options.data || null,
        },
        { client: queryClient }
      )
    }

    return notification
  }

  async dispatchEmail(options: NotificationData): Promise<void> {
    if (options.sendEmail) {
      try {
        const user = options.userId ? await User.find(options.userId) : null
        if (user) {
          await this.sendEmail(
            user,
            options.emailSubject || options.title,
            options.title,
            options.message,
            options.data
          )
        } else if (options.recipientEmail) {
          await SendMailJob.dispatch({
            to: options.recipientEmail,
            subject: options.emailSubject || options.title,
            html: `<h1>${escapeHtml(options.title)}</h1><p>${escapeHtml(options.message)}</p>`,
          }).toQueue('emails')
        }
      } catch {
        // Email send failed — in-app notification was still created
      }
    }
  }

  /**
   * Send an email notification
   */
  async sendEmail(
    user: User,
    subject: string,
    title: string,
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    await SendMailJob.dispatch({
      to: user.email,
      subject,
      html: this.getEmailHtml(user, title, message, data),
    }).toQueue('emails')
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(
    notificationId: number,
    userId: number,
    companyId: number | null = null
  ): Promise<Notification | null> {
    const query = Notification.query().where('id', notificationId).where('userId', userId)
    if (companyId === null) query.whereNull('companyId')
    else query.where('companyId', companyId)
    const notification = await query.first()

    if (!notification) {
      return null
    }

    notification.readAt = DateTime.now()
    await notification.save()

    return notification
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: number, companyId: number | null = null): Promise<number> {
    const query = Notification.query().where('userId', userId).whereNull('readAt')
    if (companyId === null) query.whereNull('companyId')
    else query.where('companyId', companyId)
    const result = await query.update({ readAt: DateTime.now().toSQL() })

    return result[0] || 0
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: number, companyId: number | null = null): Promise<number> {
    const query = Notification.query().where('userId', userId).whereNull('readAt')
    if (companyId === null) query.whereNull('companyId')
    else query.where('companyId', companyId)
    const result = await query.count('* as total')

    return Number(result[0].$extras.total)
  }

  /**
   * Get notifications for a user
   */
  async getNotifications(
    userId: number,
    page: number = 1,
    limit: number = 20,
    unreadOnly: boolean = false,
    companyId: number | null = null
  ) {
    const query = Notification.query().where('userId', userId).orderBy('createdAt', 'desc')
    if (companyId === null) query.whereNull('companyId')
    else query.where('companyId', companyId)

    if (unreadOnly) {
      query.whereNull('readAt')
    }

    return query.paginate(page, limit)
  }

  // ==================== Helper Methods for Common Notifications ====================

  /**
   * Notify user that their company was approved
   */
  async notifyCompanyApproved(
    userId: number,
    companyId: number,
    companyName: string
  ): Promise<Notification> {
    return this.notify({
      userId,
      companyId,
      type: 'company_approved',
      title: 'Company Approved',
      message: `Congratulations! Your company "${companyName}" has been approved. You can now create spaces and start receiving bookings.`,
      sendEmail: true,
      emailSubject: 'Your Company Has Been Approved - QaaAt',
    })
  }

  /**
   * Notify user that their company was rejected
   */
  async notifyCompanyRejected(
    userId: number,
    companyId: number,
    companyName: string,
    reason: string
  ): Promise<Notification> {
    return this.notify({
      userId,
      companyId,
      type: 'company_rejected',
      title: 'Company Registration Rejected',
      message: `Your company "${companyName}" registration was rejected. Reason: ${reason}`,
      data: { reason },
      sendEmail: true,
      emailSubject: 'Company Registration Update - QaaAt',
    })
  }

  /**
   * Notify user that their booking was accepted
   */
  async notifyBookingAccepted(
    userId: number,
    spaceName: string,
    bookingDate: string,
    bookingId: number
  ): Promise<Notification> {
    return this.notify({
      userId,
      type: 'booking_accepted',
      title: 'Booking Confirmed',
      message: `Great news! Your booking for "${spaceName}" on ${bookingDate} has been accepted. Please proceed with payment to secure your reservation.`,
      data: { bookingId, spaceName, bookingDate },
      sendEmail: true,
      emailSubject: 'Booking Confirmed - QaaAt',
    })
  }

  /**
   * Notify user that their booking was rejected
   */
  async notifyBookingRejected(
    userId: number,
    spaceName: string,
    bookingDate: string,
    reason: string,
    bookingId: number
  ): Promise<Notification> {
    return this.notify({
      userId,
      type: 'booking_rejected',
      title: 'Booking Rejected',
      message: `Unfortunately, your booking for "${spaceName}" on ${bookingDate} was rejected. Reason: ${reason}`,
      data: { bookingId, spaceName, bookingDate, reason },
      sendEmail: true,
      emailSubject: 'Booking Update - QaaAt',
    })
  }

  /**
   * Notify company of new booking request
   */
  async notifyNewBookingRequest(
    companyUserId: number,
    companyId: number,
    userName: string,
    spaceName: string,
    bookingDate: string,
    bookingId: number
  ): Promise<Notification> {
    return this.notify({
      userId: companyUserId,
      companyId,
      type: 'new_booking_request',
      title: 'New Booking Request',
      message: `You have a new booking request from ${userName} for "${spaceName}" on ${bookingDate}. Please review and respond within 7 days.`,
      data: { bookingId, spaceName, bookingDate, userName },
      sendEmail: true,
      emailSubject: 'New Booking Request - QaaAt',
    })
  }

  /**
   * Notify user that their booking expired
   */
  async notifyBookingExpired(
    userId: number,
    spaceName: string,
    bookingDate: string,
    bookingId: number
  ): Promise<Notification> {
    return this.notify({
      userId,
      type: 'booking_expired',
      title: 'Booking Request Expired',
      message: `Your booking request for "${spaceName}" on ${bookingDate} has expired as the company did not respond within 7 days. Please try booking again or choose a different space.`,
      data: { bookingId, spaceName, bookingDate },
      sendEmail: true,
      emailSubject: 'Booking Request Expired - QaaAt',
    })
  }

  /**
   * Generate email HTML content
   */
  private getEmailHtml(
    user: User,
    title: string,
    message: string,
    data?: Record<string, any>
  ): string {
    const appUrl = env.get('APP_URL')
    const safeTitle = escapeHtml(title)
    const safeMessage = escapeHtml(message)
    const safeUserName = user.userName ? escapeHtml(user.userName) : ''
    const actionButton = data?.bookingId
      ? `<a href="${appUrl}/bookings/${data.bookingId}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">View Booking</a>`
      : ''

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">QaaAt</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Venue and Space Booking Platform</p>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">${safeTitle}</h2>

    <p>Hi${safeUserName ? ` ${safeUserName}` : ''},</p>

    <p>${safeMessage}</p>

    ${actionButton ? `<div style="text-align: center; margin: 30px 0;">${actionButton}</div>` : ''}
  </div>

  <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
    <p>&copy; ${new Date().getFullYear()} QaaAt. All rights reserved.</p>
  </div>
</body>
</html>
`
  }
}

export default new NotificationService()
