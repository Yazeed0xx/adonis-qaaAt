import InvalidStateException from '#exceptions/invalid_state_exception'

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'completed'

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['accepted', 'rejected', 'cancelled', 'expired'],
  accepted: ['confirmed', 'cancelled'],
  confirmed: ['completed'],
  rejected: [],
  cancelled: [],
  expired: [],
  completed: [],
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
