import DomainException from '#exceptions/domain_exception'

export default class InvalidCredentialsException extends DomainException {
  constructor() {
    super('Invalid credentials', 401, 'INVALID_CREDENTIALS')
  }
}
