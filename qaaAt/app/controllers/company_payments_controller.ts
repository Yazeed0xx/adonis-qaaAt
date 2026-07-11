import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import payments from '#services/payment_service'
import companyContextService from '#services/company_context_service'
import {
  cancellationPolicyValidator,
  cancellationValidator,
  refundRetryValidator,
} from '#validators/payment_validator'
export default class CompanyPaymentsController {
  async index({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'finance.view')
    const rows = await payments.list(
      'company',
      companyContext.companyId,
      Math.max(1, Number(request.input('page', 1))),
      Math.min(100, Math.max(1, Number(request.input('limit', 20))))
    )
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async refunds({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'finance.view')
    const rows = await db
      .from('refunds')
      .where('company_id', companyContext.companyId)
      .select(
        'id',
        'reference',
        'payment_id',
        'booking_id',
        'requested_amount_minor',
        'approved_amount_minor',
        'currency',
        'reason',
        'status',
        'created_at',
        'processed_at'
      )
      .orderBy('id', 'desc')
      .paginate(
        Math.max(1, Number(request.input('page', 1))),
        Math.min(100, Math.max(1, Number(request.input('limit', 20))))
      )
    return response.ok({
      data: rows.all().map((r: any) => ({
        ...r,
        requested_amount_minor: String(r.requested_amount_minor),
        approved_amount_minor: String(r.approved_amount_minor),
      })),
      meta: rows.getMeta(),
    })
  }
  async policies({ companyContext, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'finance.view')
    return response.ok({
      data: await db
        .from('cancellation_policies')
        .where('company_id', companyContext.companyId)
        .orderBy('version', 'desc'),
    })
  }
  async storePolicy({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'refunds.approve')
    return response.created({
      data: await payments.createPolicy(
        companyContext.companyId,
        companyContext.membership.id,
        await request.validateUsing(cancellationPolicyValidator)
      ),
    })
  }
  async cancel({ auth, companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'refunds.request')
    const input = await request.validateUsing(cancellationValidator)
    return response.ok({
      data: await payments.cancelPaidBooking(
        'company',
        auth.getUserOrFail().id,
        Number(params.bookingId),
        input.reason,
        input.idempotencyKey,
        companyContext.companyId
      ),
    })
  }
  async retryRefund({ companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'refunds.approve')
    const input = await request.validateUsing(refundRetryValidator)
    return response.ok({
      data: await payments.retryRefund(
        companyContext.companyId,
        Number(params.id),
        input.idempotencyKey
      ),
    })
  }
  async reconciliation({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'finance.view')
    return response.ok({
      data: await payments.reconciliation(companyContext.companyId, request.input('result')),
    })
  }
}
