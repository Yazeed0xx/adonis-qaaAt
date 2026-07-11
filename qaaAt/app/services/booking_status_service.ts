import InvalidStateException from '#exceptions/invalid_state_exception'

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'completed'
  | 'payment_expired'
  | 'partially_refunded'
  | 'refunded'

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['accepted', 'rejected', 'cancelled', 'expired'],
  accepted: ['confirmed', 'cancelled', 'payment_expired'],
  confirmed: ['completed', 'cancelled', 'partially_refunded', 'refunded'],
  rejected: [],
  cancelled: [],
  expired: [],
  completed: [],
  payment_expired: [],
  partially_refunded: ['refunded'],
  refunded: [],
}

export class BookingStatusService {
  assertTransition(current: string, next: BookingStatus) {
    const currentStatus = current as BookingStatus
    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? []

    if (!allowed.includes(next)) {
      throw new InvalidStateException(
        `Cannot transition booking from ${current} to ${next}`,
        'BOOKING_INVALID_TRANSITION'
      )
    }
  }
}

export default new BookingStatusService()
