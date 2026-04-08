import factory from '@adonisjs/lucid/factories'
import Hall from '#models/hall'
import { CompanyFactory } from '#database/factories/company_factory'

export const HallFactory = factory
  .define(Hall, ({ faker }) => {
    return {
      name: `${faker.word.adjective()} ${faker.word.noun()} Hall`,
      description: faker.lorem.paragraph(),
      capacity: faker.number.int({ min: 80, max: 600 }),
      location: faker.helpers.arrayElement(['Al Olaya District', 'Al Hamra District', 'Corniche Road']),
      amenities: {
        parking: true,
        wifi: true,
        catering: faker.datatype.boolean(),
        sound_system: faker.datatype.boolean(),
      },
      pricing: faker.number.int({ min: 2000, max: 6000 }).toString(),
      images: [faker.image.url()],
      address: faker.location.streetAddress(),
      city: faker.helpers.arrayElement(['Riyadh', 'Jeddah', 'Dammam']),
      isAvailable: true,
      services: ['free parking', 'complimentary drinks'],
    }
  })
  .state('available', (hall) => {
    hall.isAvailable = true
  })
  .state('unavailable', (hall) => {
    hall.isAvailable = false
  })
  .relation('company', () => CompanyFactory)
  .build()
