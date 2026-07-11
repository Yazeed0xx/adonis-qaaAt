import DomainException from '#exceptions/domain_exception'
export default class SpaceException extends DomainException {
  constructor(message: string, code = 'SPACE_CONFLICT', status = 409) {
    super(message, status, code)
  }
}
