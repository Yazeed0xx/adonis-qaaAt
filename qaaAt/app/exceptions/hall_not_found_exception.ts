import DomainException from '#exceptions/domain_exception'

export default class HallNotFoundException extends DomainException {
  constructor() {
    super('Hall not found', 404, 'HALL_NOT_FOUND')
  }
}
