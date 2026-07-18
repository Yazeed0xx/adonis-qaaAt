import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import payments from '#services/payment_service'
import adminAuditService from '#services/admin_audit_service'
import AdminOperationException from '#exceptions/admin_operation_exception'
import { adminResourceParamsValidator } from '#validators/admin_operation_validator'
import { refundRetryValidator } from '#validators/payment_validator'
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

  async retryRefund({ auth, params, request, response }: HttpContext) {
    const { id } = await request.validateUsing(adminResourceParamsValidator, { data: params })
    const { idempotencyKey } = await request.validateUsing(refundRetryValidator)
    const refund = await db.from('refunds').where('id', id).select('company_id').first()
    if (!refund) throw new AdminOperationException('Refund not found', 'REFUND_NOT_FOUND', 404)
    const result = await payments.retryRefund(refund.company_id, id, idempotencyKey)
    await adminAuditService.record({
      adminUserId: auth.getUserOrFail().id,
      action: 'refund.retry',
      targetType: 'refund',
      targetId: id,
      metadata: { resultStatus: result.status },
    })
    return response.ok({ data: result })
  }
}
