import DomainException from '#exceptions/domain_exception'

export default class CompanyNotFoundException extends DomainException {
  constructor() {
    super('Company not found', 404, 'COMPANY_NOT_FOUND')
  }
}
