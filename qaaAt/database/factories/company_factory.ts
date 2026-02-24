import factory from '@adonisjs/lucid/factories'
import Company from '#models/company'
import User from '#models/user'
import { DateTime } from 'luxon'

export const CompanyFactory = factory
  .define(Company, async ({ faker }) => {
    const user = await User.create({
      userName: faker.person.fullName(),
      email: faker.internet.email(),
      password: 'password123',
      userType: 'company' as const,
      createdAt: DateTime.now(),
    })

    return {
      userId: user.id,
      city: faker.location.city(),
      contactPerson: faker.person.fullName(),
      businessAddress: faker.location.streetAddress(),
    }
  })
  .build()
