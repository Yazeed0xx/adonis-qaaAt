import DomainException from '#exceptions/domain_exception'

export default class ServiceUnavailableException extends DomainException {
  constructor(message: string, code: string = 'SERVICE_UNAVAILABLE') {
    super(message, 503, code)
  }
}
