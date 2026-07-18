import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import Company from '#models/company'
import { CompanyProfileFactory } from '#database/factories/company_profile_factory'
import { UserFactory } from '#database/factories/user_factory'
import CompanyMembership from '#models/company_membership'

export const CompanyFactory = factory
  .define(Company, ({ faker }) => {
    return {
      taxId: faker.string.numeric(12),
      registrationNumber: `CR-${faker.string.numeric(10)}`,
      registrationNumberPdf: faker.internet.url(),
      businessLicense: faker.internet.url(),
      contactPerson: faker.person.fullName(),
      businessAddress: faker.location.streetAddress(),
      city: faker.helpers.arrayElement(['Riyadh', 'Jeddah', 'Dammam', 'Khobar']),
      status: 'pending',
    }
  })
  .state('pending', (company) => {
    company.status = 'pending'
    company.approvedAt = null
    company.approvedBy = null
    company.rejectionReason = null
    company.rejectedAt = null
  })
  .state('approved', (company) => {
    company.status = 'approved'
    company.approvedAt = DateTime.now().minus({ days: 7 })
    company.rejectionReason = null
    company.rejectedAt = null
  })
  .state('rejected', (company, { faker }) => {
    company.status = 'rejected'
    company.approvedAt = null
    company.approvedBy = null
    company.rejectionReason = faker.lorem.sentence()
    company.rejectedAt = DateTime.now().minus({ days: 3 })
  })
  .state('suspended', (company, { faker }) => {
    company.status = 'suspended'
    company.rejectionReason = faker.lorem.sentence()
  })
  .relation('user', () => UserFactory)
  .relation('companyProfile', () => CompanyProfileFactory)
  .after('create', async (_, company, context) => {
    await CompanyMembership.create(
      {
        companyId: company.id,
        userId: company.userId,
        role: 'owner',
        status: 'active',
        joinedAt: company.createdAt,
      },
      { client: context.$trx }
    )
  })
  .build()
