import type { ModelAttributes } from '@adonisjs/lucid/types/model'
import { UserFactory } from '#database/factories/user_factory'
import { CompanyFactory } from '#database/factories/company_factory'
import CompanyMembership from '#models/company_membership'
import type Company from '#models/company'
import type User from '#models/user'
import type { CompanyRole } from '#lib/company_permissions'

type UserOverrides = Partial<ModelAttributes<User>>
type CompanyOverrides = Partial<ModelAttributes<Company>>

export interface CompanyOwnerActor {
  user: User
  company: Company
  membership: CompanyMembership
}

export interface CompanyMemberActor {
  user: User
  membership: CompanyMembership
}

export function createCustomer(overrides: UserOverrides = {}) {
  return UserFactory.apply('user', 'verified').merge(overrides).create()
}

export function createAdmin(overrides: UserOverrides = {}) {
  return UserFactory.apply('admin', 'verified').merge(overrides).create()
}

export async function createApprovedCompanyOwner(
  overrides: { user?: UserOverrides; company?: CompanyOverrides } = {}
): Promise<CompanyOwnerActor> {
  const user = await UserFactory.apply('company', 'verified')
    .merge(overrides.user ?? {})
    .create()
  const company = await CompanyFactory.apply('approved')
    .merge({ ...overrides.company, userId: user.id })
    .with('companyProfile')
    .create()
  const membership = await CompanyMembership.query()
    .where('companyId', company.id)
    .where('userId', user.id)
    .firstOrFail()

  return { user, company, membership }
}

export async function createCompanyMember(
  company: Company,
  role: CompanyRole = 'viewer',
  overrides: UserOverrides = {}
): Promise<CompanyMemberActor> {
  const user = await createCustomer(overrides)
  const membership = await createMembership(company, user, role)

  return { user, membership }
}

export function createMembership(company: Company, user: User, role: CompanyRole = 'viewer') {
  return CompanyMembership.create({
    companyId: company.id,
    userId: user.id,
    role,
    status: 'active',
    joinedAt: company.createdAt,
  })
}
