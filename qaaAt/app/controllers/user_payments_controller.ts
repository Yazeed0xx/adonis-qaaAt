import type { HttpContext } from '@adonisjs/core/http'
import payments from '#services/payment_service'
import { cancellationValidator, initiatePaymentValidator } from '#validators/payment_validator'
export default class UserPaymentsController {
  async payable({ auth, params, response }: HttpContext) {
    return response.ok({
      data: await payments.payable(auth.getUserOrFail().id, Number(params.bookingId)),
    })
  }
  async initiate({ auth, params, request, response }: HttpContext) {
    const input = await request.validateUsing(initiatePaymentValidator)
    return response.ok({
      data: await payments.initiate(
        auth.getUserOrFail().id,
        Number(params.bookingId),
        input.idempotencyKey
      ),
    })
  }
  async index({ auth, request, response }: HttpContext) {
    const rows = await payments.list(
      'user',
      auth.getUserOrFail().id,
      Math.max(1, Number(request.input('page', 1))),
      Math.min(100, Math.max(1, Number(request.input('limit', 20))))
    )
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async show({ auth, params, response }: HttpContext) {
    return response.ok({
      data: await payments.getPaymentForUser(auth.getUserOrFail().id, Number(params.id)),
    })
  }
  async receipt({ auth, params, response }: HttpContext) {
    return response.ok({ data: await payments.receipt(auth.getUserOrFail().id, Number(params.id)) })
  }
  async refund({ auth, params, response }: HttpContext) {
    return response.ok({
      data: await payments.getRefundForUser(auth.getUserOrFail().id, Number(params.id)),
    })
  }
  async cancel({ auth, params, request, response }: HttpContext) {
    const input = await request.validateUsing(cancellationValidator)
    return response.ok({
      data: await payments.cancelPaidBooking(
        'customer',
        auth.getUserOrFail().id,
        Number(params.bookingId),
        input.reason,
        input.idempotencyKey
      ),
    })
  }
}
