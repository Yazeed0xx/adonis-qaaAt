import { DateTime } from 'luxon'
import SendMailJob from '#jobs/send_mail_job'
import Notification from '#models/notification'
import User from '#models/user'
import env from '#start/env'

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

interface NotificationData {
  userId: number
  type: NotificationType
  title: string
  message: string
  data?: Record<string, any>
  sendEmail?: boolean
  emailSubject?: string
}

export type QueuedNotificationData = NotificationData

export class NotificationService {
  /**
   * Create an in-app notification
   */
  async notify(options: NotificationData): Promise<Notification> {
    const notification = await Notification.create({
      userId: options.userId,
      type: options.type,
      title: options.title,
      message: options.message,
      data: options.data || null,
    })

    // Send email if requested (non-blocking — don't fail notification if mail fails)
    if (options.sendEmail) {
      try {
        const user = await User.find(options.userId)
        if (user) {
          await this.sendEmail(
            user,
            options.emailSubject || options.title,
            options.title,
            options.message,
            options.data
          )
        }
      } catch {
        // Email send failed — in-app notification was still created
      }
    }

    return notification
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
  async markAsRead(notificationId: number, userId: number): Promise<Notification | null> {
    const notification = await Notification.query()
      .where('id', notificationId)
      .where('userId', userId)
      .first()

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
  async markAllAsRead(userId: number): Promise<number> {
    const result = await Notification.query()
      .where('userId', userId)
      .whereNull('readAt')
      .update({ readAt: DateTime.now().toSQL() })

    return result[0] || 0
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: number): Promise<number> {
    const result = await Notification.query()
      .where('userId', userId)
      .whereNull('readAt')
      .count('* as total')

    return Number(result[0].$extras.total)
  }

  /**
   * Get notifications for a user
   */
  async getNotifications(
    userId: number,
    page: number = 1,
    limit: number = 20,
    unreadOnly: boolean = false
  ) {
    const query = Notification.query().where('userId', userId).orderBy('createdAt', 'desc')

    if (unreadOnly) {
      query.whereNull('readAt')
    }

    return query.paginate(page, limit)
  }

  // ==================== Helper Methods for Common Notifications ====================

  /**
   * Notify user that their company was approved
   */
  async notifyCompanyApproved(userId: number, companyName: string): Promise<Notification> {
    return this.notify({
      userId,
      type: 'company_approved',
      title: 'Company Approved',
      message: `Congratulations! Your company "${companyName}" has been approved. You can now create halls and start receiving bookings.`,
      sendEmail: true,
      emailSubject: 'Your Company Has Been Approved - QaaAt',
    })
  }

  /**
   * Notify user that their company was rejected
   */
  async notifyCompanyRejected(
    userId: number,
    companyName: string,
    reason: string
  ): Promise<Notification> {
    return this.notify({
      userId,
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
    hallName: string,
    bookingDate: string,
    bookingId: number
  ): Promise<Notification> {
    return this.notify({
      userId,
      type: 'booking_accepted',
      title: 'Booking Confirmed',
      message: `Great news! Your booking for "${hallName}" on ${bookingDate} has been accepted. Please proceed with payment to secure your reservation.`,
      data: { bookingId, hallName, bookingDate },
      sendEmail: true,
      emailSubject: 'Booking Confirmed - QaaAt',
    })
  }

  /**
   * Notify user that their booking was rejected
   */
  async notifyBookingRejected(
    userId: number,
    hallName: string,
    bookingDate: string,
    reason: string,
    bookingId: number
  ): Promise<Notification> {
    return this.notify({
      userId,
      type: 'booking_rejected',
      title: 'Booking Rejected',
      message: `Unfortunately, your booking for "${hallName}" on ${bookingDate} was rejected. Reason: ${reason}`,
      data: { bookingId, hallName, bookingDate, reason },
      sendEmail: true,
      emailSubject: 'Booking Update - QaaAt',
    })
  }

  /**
   * Notify company of new booking request
   */
  async notifyNewBookingRequest(
    companyUserId: number,
    userName: string,
    hallName: string,
    bookingDate: string,
    bookingId: number
  ): Promise<Notification> {
    return this.notify({
      userId: companyUserId,
      type: 'new_booking_request',
      title: 'New Booking Request',
      message: `You have a new booking request from ${userName} for "${hallName}" on ${bookingDate}. Please review and respond within 7 days.`,
      data: { bookingId, hallName, bookingDate, userName },
      sendEmail: true,
      emailSubject: 'New Booking Request - QaaAt',
    })
  }

  /**
   * Notify user that their booking expired
   */
  async notifyBookingExpired(
    userId: number,
    hallName: string,
    bookingDate: string,
    bookingId: number
  ): Promise<Notification> {
    return this.notify({
      userId,
      type: 'booking_expired',
      title: 'Booking Request Expired',
      message: `Your booking request for "${hallName}" on ${bookingDate} has expired as the company did not respond within 7 days. Please try booking again or choose a different hall.`,
      data: { bookingId, hallName, bookingDate },
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
    const actionButton = data?.bookingId
      ? `<a href="${appUrl}/bookings/${data.bookingId}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">View Booking</a>`
      : ''

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">QaaAt</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Hall Booking Platform</p>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">${title}</h2>

    <p>Hi${user.userName ? ` ${user.userName}` : ''},</p>

    <p>${message}</p>

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
