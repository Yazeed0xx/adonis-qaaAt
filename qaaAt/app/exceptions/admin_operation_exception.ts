import DomainException from '#exceptions/domain_exception'

export default class AdminOperationException extends DomainException {
  constructor(message: string, code: string, status = 409) {
    super(message, status, code)
  }
}
