import { DateTime } from 'luxon'
import { CompanyFactory } from '#database/factories/company_factory'
import {
  approvedCompanyRecipe,
  pendingCompanyRecipe,
  rejectedCompanyRecipe,
} from '#database/factories/recipes'
import type { DemoScenarioContext } from '#database/seeding/scenario_context'

export async function seedCompanies(context: DemoScenarioContext) {
  const admin = context.admin
  if (!admin) throw new Error('Accounts must be seeded before companies')

  context.companies.royal = await approvedCompanyRecipe(CompanyFactory, admin.id, {
    userName: 'Royal Events',
    email: 'royal@example.com',
    companyName: 'Royal Events Co.',
    description:
      'Premium wedding and event venues in Riyadh. We specialize in luxury celebrations.',
    logo: 'https://picsum.photos/seed/royal/200/200',
    banner: 'https://picsum.photos/seed/royalbanner/1200/400',
    website: 'https://royalevents.sa',
    socialLinks: { instagram: '@royalevents', twitter: '@royalevents_sa' },
  })
    .merge({
      taxId: '300123456789',
      registrationNumber: 'CR-1234567890',
      registrationNumberPdf: 'https://example.com/docs/royal-cr.pdf',
      contactPerson: 'Khalid Al-Mansour',
      businessAddress: '123 King Fahd Road, Al Olaya District',
      city: 'Riyadh',
      approvedAt: DateTime.now().minus({ days: 30 }),
      approvedBy: admin.id,
    })
    .create()

  context.companies.golden = await approvedCompanyRecipe(CompanyFactory, admin.id, {
    userName: 'Golden Palace',
    email: 'golden@example.com',
    companyName: 'Golden Palace Events',
    description: 'Elegant venues for weddings, conferences, and special occasions in Jeddah.',
    logo: 'https://picsum.photos/seed/golden/200/200',
    banner: 'https://picsum.photos/seed/goldenbanner/1200/400',
    website: 'https://goldenpalace.sa',
    socialLinks: { instagram: '@goldenpalace' },
  })
    .merge({
      taxId: '300987654321',
      registrationNumber: 'CR-0987654321',
      registrationNumberPdf: 'https://example.com/docs/golden-cr.pdf',
      contactPerson: 'Nora Al-Faisal',
      businessAddress: '456 Prince Sultan Street',
      city: 'Jeddah',
      approvedAt: DateTime.now().minus({ days: 15 }),
      approvedBy: admin.id,
    })
    .create()

  context.companies.star = await pendingCompanyRecipe(CompanyFactory, {
    userName: 'Star Events',
    email: 'star@example.com',
    companyName: 'Star Events',
    description: 'New event management company in Dammam.',
  })
    .merge({
      registrationNumber: 'CR-5555555555',
      registrationNumberPdf: 'https://example.com/docs/star-cr.pdf',
      contactPerson: 'Omar Al-Harbi',
      businessAddress: '789 Corniche Road',
      city: 'Dammam',
    })
    .create()

  context.companies.quick = await rejectedCompanyRecipe(CompanyFactory, {
    userName: 'Quick Events',
    email: 'quick@example.com',
    companyName: 'Quick Events',
  })
    .merge({
      registrationNumber: 'CR-9999999999',
      registrationNumberPdf: 'https://example.com/docs/quick-cr.pdf',
      businessAddress: '321 Tahlia Street',
      city: 'Riyadh',
      rejectionReason:
        'Incomplete business documentation. Please provide valid commercial registration.',
      rejectedAt: DateTime.now().minus({ days: 5 }),
    })
    .create()
}
