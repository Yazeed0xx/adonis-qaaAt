import DomainException from '#exceptions/domain_exception'

export default class SpaceMediaException extends DomainException {
  constructor(message: string, code: string, status = 422) {
    super(message, status, code)
  }
}
