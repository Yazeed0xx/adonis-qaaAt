import DomainException from '#exceptions/domain_exception'

export default class BookingConflictException extends DomainException {
  constructor(message: string, code: string = 'BOOKING_CONFLICT') {
    super(message, 409, code)
  }
}
