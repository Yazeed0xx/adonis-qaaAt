import DomainException from '#exceptions/domain_exception'

export default class AccessDeniedException extends DomainException {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'ACCESS_DENIED')
  }
}
