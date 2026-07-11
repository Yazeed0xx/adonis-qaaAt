import type { HttpContext } from '@adonisjs/core/http'
import InventoryException from '#exceptions/inventory_exception'
import payments from '#services/payment_service'

const MAX_WEBHOOK_BYTES = 64 * 1024

export default class PaymentWebhooksController {
  async fake({ request, response }: HttpContext) {
    const original = request.raw()
    if (original === null)
      throw new InventoryException('Webhook body is required', 'PAYMENT_EVENT_INVALID', 422)
    const raw = Buffer.from(original, 'utf8')
    if (raw.byteLength > MAX_WEBHOOK_BYTES)
      throw new InventoryException('Webhook body exceeds 64 KB', 'PAYMENT_EVENT_TOO_LARGE', 413)
    const result = await payments.processWebhook(raw, request.header('x-qaaat-signature'))
    return response.ok({ received: true, ...result })
  }
}
