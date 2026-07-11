import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { DateTime } from 'luxon'
import paymentConfig from '#config/payment'
import type { PaymentProvider, VerifiedPaymentEvent } from '../contracts/payment_provider.js'

export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake'
  private secret() {
    if (!paymentConfig.isFakeAllowed || paymentConfig.driver !== 'fake')
      throw new Error('Fake payment provider is unavailable')
    const secret = paymentConfig.fakeWebhookSecret
    if (!secret) throw new Error('FAKE_PAYMENT_WEBHOOK_SECRET is required for fake payments')
    return secret
  }
  sign(rawBody: Buffer) {
    return createHmac('sha256', this.secret()).update(rawBody).digest('hex')
  }
  verifyWebhook(rawBody: Buffer, signature?: string) {
    if (!signature) return false
    const expected = Buffer.from(this.sign(rawBody), 'utf8')
    const actual = Buffer.from(signature, 'utf8')
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }
  parseVerifiedWebhookEvent(rawBody: Buffer): VerifiedPaymentEvent {
    const parsed: unknown = JSON.parse(rawBody.toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('PAYMENT_EVENT_INVALID')
    const value = parsed as Record<string, unknown>
    const eventTypes = [
      'payment.succeeded',
      'payment.failed',
      'payment.cancelled',
      'refund.succeeded',
      'refund.failed',
    ] as const
    const expectedStatus: Record<(typeof eventTypes)[number], string> = {
      'payment.succeeded': 'succeeded',
      'payment.failed': 'failed',
      'payment.cancelled': 'cancelled',
      'refund.succeeded': 'succeeded',
      'refund.failed': 'failed',
    }
    if (typeof value.eventId !== 'string' || !/^[A-Za-z0-9_-]{4,180}$/.test(value.eventId))
      throw new Error('PAYMENT_EVENT_INVALID')
    if (!eventTypes.includes(value.eventType as (typeof eventTypes)[number]))
      throw new Error('PAYMENT_EVENT_INVALID')
    if (typeof value.reference !== 'string' || !/^[A-Za-z0-9_-]{4,180}$/.test(value.reference))
      throw new Error('PAYMENT_EVENT_INVALID')
    if (
      value.internalCorrelationReference !== undefined &&
      (typeof value.internalCorrelationReference !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value.internalCorrelationReference
        ))
    )
      throw new Error('PAYMENT_EVENT_INVALID')
    if (typeof value.amountMinor !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(value.amountMinor))
      throw new Error('PAYMENT_EVENT_INVALID')
    if (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency))
      throw new Error('PAYMENT_EVENT_INVALID')
    const eventType = value.eventType as (typeof eventTypes)[number]
    if (value.status !== expectedStatus[eventType]) throw new Error('PAYMENT_EVENT_INVALID')
    if (
      typeof value.occurredAt !== 'string' ||
      !DateTime.fromISO(value.occurredAt, { setZone: true }).isValid
    )
      throw new Error('PAYMENT_EVENT_INVALID')
    return {
      providerEventId: value.eventId,
      eventType,
      providerObjectReference: value.reference,
      internalCorrelationReference: value.internalCorrelationReference as string | undefined,
      amountMinor: value.amountMinor,
      currency: value.currency,
      status: value.status as VerifiedPaymentEvent['status'],
      occurredAt: value.occurredAt,
      safePayload: {
        scenario: typeof value.scenario === 'string' ? value.scenario.slice(0, 80) : null,
      },
    }
  }
  async createPaymentAttempt(
    input: Parameters<PaymentProvider['createPaymentAttempt']>[0]
  ): ReturnType<PaymentProvider['createPaymentAttempt']> {
    const id = `fake_pa_${randomUUID()}`
    this.secret()
    return {
      providerPaymentReference: `fake_pay_${input.internalAttemptReference}`,
      providerAttemptReference: id,
      status: 'pending' as const,
      checkoutUrl: `qaaat-fake://checkout/${id}`,
    }
  }
  async retrievePaymentStatus() {
    return 'pending' as const
  }
  async requestRefund(
    input: Parameters<PaymentProvider['requestRefund']>[0]
  ): ReturnType<PaymentProvider['requestRefund']> {
    this.secret()
    return {
      providerRefundReference: `fake_ref_${input.internalRefundReference}`,
      status: 'pending' as const,
    }
  }
  async retrieveRefundStatus() {
    return 'pending' as const
  }
}

export default new FakePaymentProvider()
