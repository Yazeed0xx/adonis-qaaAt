import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import Booking from '#models/booking'
import adminAuditService from '#services/admin_audit_service'
import BookingTransformer from '#transformers/booking_transformer'

export default class BookingsController {
  async index({ request, serialize }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const bookings = await Booking.query()
      .preload('user')
      .whereNull('deletedAt')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return serialize(
      BookingTransformer.paginate(bookings.all(), bookings.getMeta()).useVariant('forAdminView')
    )
  }

  async destroy({ params, auth, response }: HttpContext) {
    const booking = await Booking.findOrFail(params.id)

    booking.deletedAt = DateTime.now()
    await booking.save()
    await adminAuditService.record({
      adminUserId: auth.getUserOrFail().id,
      action: 'booking.delete',
      targetType: 'booking',
      targetId: booking.id,
      metadata: { userId: booking.userId, spaceId: booking.spaceId },
    })

    return response.ok({ message: 'Booking deleted successfully' })
  }
}
