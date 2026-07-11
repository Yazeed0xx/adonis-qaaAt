import DomainException from '#exceptions/domain_exception'

export default class CompanyMembershipException extends DomainException {
  constructor(message: string, code = 'COMPANY_MEMBERSHIP_CONFLICT', status = 409) {
    super(message, status, code)
  }
}
