import factory from '@adonisjs/lucid/factories'
import Service from '#models/service'
import { CompanyFactory } from '#database/factories/company_factory'

export const ServiceFactory = factory
  .define(Service, ({ faker }) => {
    return {
      name: faker.helpers.arrayElement([
        'Premium Decoration',
        'Photography Package',
        'Video Coverage',
        'Live Music',
        'Catering Package',
      ]),
      description: faker.lorem.sentence(),
      price: faker.number.int({ min: 2500, max: 15000 }).toString(),
      isActive: true,
    }
  })
  .state('active', (service) => {
    service.isActive = true
  })
  .state('inactive', (service) => {
    service.isActive = false
  })
  .relation('company', () => CompanyFactory)
  .build()
