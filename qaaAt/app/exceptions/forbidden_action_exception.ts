import DomainException from '#exceptions/domain_exception'

export default class ForbiddenActionException extends DomainException {
  constructor(message: string = 'You are not allowed to perform this action') {
    super(message, 403, 'FORBIDDEN_ACTION')
  }
}
