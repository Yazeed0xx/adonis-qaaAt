import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import payments from '#services/payment_service'
export default class AdminPaymentsController {
  async index({ request, response }: HttpContext) {
    const rows = await payments.list(
      'admin',
      0,
      Math.max(1, Number(request.input('page', 1))),
      Math.min(100, Math.max(1, Number(request.input('limit', 20))))
    )
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async attempts({ response }: HttpContext) {
    return response.ok({
      data: await db
        .from('payment_attempts')
        .select(
          'id',
          'reference',
          'payment_id',
          'provider',
          'status',
          'failure_code',
          'failure_message',
          'initiated_at',
          'succeeded_at'
        )
        .orderBy('id', 'desc')
        .limit(100),
    })
  }
  async webhooks({ response }: HttpContext) {
    return response.ok({
      data: await db
        .from('payment_webhook_events')
        .select(
          'id',
          'provider',
          'provider_event_id',
          'signature_verified',
          'event_type',
          'payload_hash',
          'received_at',
          'processed_at',
          'outcome',
          'failure_reason'
        )
        .orderBy('id', 'desc')
        .limit(100),
    })
  }
  async refunds({ response }: HttpContext) {
    return response.ok({
      data: await db
        .from('refunds')
        .select(
          'id',
          'reference',
          'payment_id',
          'booking_id',
          'company_id',
          'requested_amount_minor',
          'approved_amount_minor',
          'currency',
          'status',
          'created_at',
          'processed_at'
        )
        .orderBy('id', 'desc')
        .limit(100),
    })
  }
  async reconciliation({ request, response }: HttpContext) {
    return response.ok({ data: await payments.reconciliation(undefined, request.input('result')) })
  }
}
