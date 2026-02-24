import factory from '@adonisjs/lucid/factories'
import User from '#models/user'
import { DateTime } from 'luxon'

export const UserFactory = factory
  .define(User, ({ faker }) => {
    return {
      email: faker.internet.email(),

      password: 'password123',
      userType: 'user' as const,
      userName: faker.person.firstName(),
      createdAt: DateTime.now(),
    }
  })
  .build()
