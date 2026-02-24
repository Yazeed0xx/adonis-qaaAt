import type { HttpContext } from '@adonisjs/core/http'
import notificationService from '#services/notification_service'

export default class NotificationController {
  /**
   * Get all notifications for the authenticated user
   */
  async index({ auth, request, response }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))
    const unreadOnly = request.input('unread_only', false)

    const notifications = await notificationService.getNotifications(
      user.id,
      page,
      limit,
      unreadOnly === 'true' || unreadOnly === true
    )

    return response.ok(notifications)
  }

  /**
   * Get unread notification count
   */
  async unreadCount({ auth, response }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const count = await notificationService.getUnreadCount(user.id)

    return response.ok({
      unreadCount: count,
    })
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead({ auth, params, response }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const notification = await notificationService.markAsRead(params.id, user.id)

    if (!notification) {
      return response.notFound({
        message: 'Notification not found',
      })
    }

    return response.ok({
      message: 'Notification marked as read',
      notification,
    })
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead({ auth, response }: HttpContext) {
    await auth.check()
    const user = auth.getUserOrFail()

    const count = await notificationService.markAllAsRead(user.id)

    return response.ok({
      message: 'All notifications marked as read',
      markedCount: count,
    })
  }
}
