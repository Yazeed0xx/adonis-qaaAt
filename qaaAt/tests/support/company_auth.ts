import type Company from '#models/company'
type CompanyScope = number | Pick<Company, 'id'>

/** Abilities used by functional tests to exercise the real company token boundary. */
export function companyTokenAbilities(scope: CompanyScope): string[] {
  const companyId = typeof scope === 'number' ? scope : scope.id

  return ['client:company_app', `company:${companyId}`]
}
