export function assertBtreeGistAvailable(available: boolean) {
  if (!available)
    throw new Error(
      'SPRINT3_BTREE_GIST_UNAVAILABLE: provision the PostgreSQL btree_gist extension before deployment; application-only overlap checks are not supported'
    )
}

export function classifyAcceptedBooking(
  paymentDueDate: Date | string | null,
  now: Date
): 'active_hold' | 'payment_expired_missing_deadline' | 'payment_expired_elapsed_deadline' {
  if (!paymentDueDate) return 'payment_expired_missing_deadline'
  return new Date(paymentDueDate) > now ? 'active_hold' : 'payment_expired_elapsed_deadline'
}
