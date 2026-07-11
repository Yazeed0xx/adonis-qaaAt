export type ProviderPaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'unknown'
export type ProviderRefundStatus = 'pending' | 'succeeded' | 'failed' | 'unknown'

export type VerifiedPaymentEvent = {
  providerEventId: string
  eventType:
    | 'payment.succeeded'
    | 'payment.failed'
    | 'payment.cancelled'
    | 'refund.succeeded'
    | 'refund.failed'
  providerObjectReference: string
  internalCorrelationReference?: string
  amountMinor: string
  currency: 'SAR' | string
  status: ProviderPaymentStatus | ProviderRefundStatus
  occurredAt: string
  safePayload: Record<string, unknown>
}

export interface PaymentProvider {
  readonly name: string
  createPaymentAttempt(input: {
    internalAttemptReference: string
    amountMinor: string
    currency: 'SAR'
    expiresAt: string
  }): Promise<{
    providerPaymentReference: string
    providerAttemptReference: string
    status: ProviderPaymentStatus
    checkoutUrl: string | null
  }>
  retrievePaymentStatus(reference: string): Promise<ProviderPaymentStatus>
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean
  parseVerifiedWebhookEvent(rawBody: Buffer): VerifiedPaymentEvent
  requestRefund(input: {
    internalRefundReference: string
    providerPaymentReference: string
    amountMinor: string
    currency: 'SAR'
  }): Promise<{ providerRefundReference: string; status: ProviderRefundStatus }>
  retrieveRefundStatus(reference: string): Promise<ProviderRefundStatus>
}
