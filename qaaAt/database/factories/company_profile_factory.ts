import factory from '@adonisjs/lucid/factories'
import CompanyProfile from '#models/company_profile'

export const CompanyProfileFactory = factory
  .define(CompanyProfile, ({ faker }) => {
    return {
      companyName: faker.company.name(),
      description: faker.company.catchPhrase(),
      logo: faker.image.url(),
      banner: faker.image.url(),
      website: faker.internet.url(),
      socialLinks: {
        instagram: `@${faker.internet.username().toLowerCase()}`,
        twitter: `@${faker.internet.username().toLowerCase()}`,
      },
    }
  })
  .build()
