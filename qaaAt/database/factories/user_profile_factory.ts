import factory from '@adonisjs/lucid/factories'
import UserProfile from '#models/user_profile'

export const UserProfileFactory = factory
  .define(UserProfile, ({ faker }) => {
    return {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      phone: `+9665${faker.string.numeric(8)}`,
      address: faker.location.streetAddress(),
      avatar: faker.image.avatar(),
    }
  })
  .build()
