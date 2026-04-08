import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import User from '#models/user'
import { UserProfileFactory } from '#database/factories/user_profile_factory'

export const UserFactory = factory
  .define(User, ({ faker }) => {
    return {
      userName: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      password: 'password123',
      userType: 'user' as const,
      emailVerifiedAt: DateTime.now(),
    }
  })
  .state('user', (user) => {
    user.userType = 'user'
  })
  .state('company', (user) => {
    user.userType = 'company'
  })
  .state('admin', (user) => {
    user.userType = 'admin'
  })
  .state('verified', (user) => {
    user.emailVerifiedAt = DateTime.now()
    user.emailVerificationToken = null
    user.emailVerificationExpiresAt = null
  })
  .state('unverified', (user, { faker }) => {
    user.emailVerifiedAt = null
    user.emailVerificationToken = faker.string.alphanumeric(32)
    user.emailVerificationExpiresAt = DateTime.now().plus({ days: 1 })
  })
  .state('banned', (user) => {
    user.deletedAt = DateTime.now()
  })
  .relation('userProfile', () => UserProfileFactory)
  .build()
