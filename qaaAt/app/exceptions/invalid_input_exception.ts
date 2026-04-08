import DomainException from '#exceptions/domain_exception'

export default class InvalidInputException extends DomainException {
  constructor(message: string, code: string = 'INVALID_INPUT') {
    super(message, 422, code)
  }
}
