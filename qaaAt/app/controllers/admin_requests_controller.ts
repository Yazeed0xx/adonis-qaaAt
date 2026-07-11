import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class AdminRequestsController {
  async bookings({ request, response }: HttpContext) {
    const rows = await db
      .from('bookings')
      .orderBy('created_at', 'desc')
      .paginate(Math.max(1, Number(request.input('page', 1))), 20)
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async inquiries({ request, response }: HttpContext) {
    const rows = await db
      .from('space_inquiries')
      .orderBy('created_at', 'desc')
      .paginate(Math.max(1, Number(request.input('page', 1))), 20)
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async visits({ request, response }: HttpContext) {
    const rows = await db
      .from('visit_requests')
      .orderBy('created_at', 'desc')
      .paginate(Math.max(1, Number(request.input('page', 1))), 20)
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
}
