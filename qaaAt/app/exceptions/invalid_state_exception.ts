import DomainException from '#exceptions/domain_exception'

export default class InvalidStateException extends DomainException {
  constructor(message: string, code: string = 'INVALID_STATE') {
    super(message, 409, code)
  }
}
