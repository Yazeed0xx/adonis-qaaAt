import DomainException from '#exceptions/domain_exception'

export default class BookingNotFoundException extends DomainException {
  constructor() {
    super('Booking not found', 404, 'BOOKING_NOT_FOUND')
  }
}
