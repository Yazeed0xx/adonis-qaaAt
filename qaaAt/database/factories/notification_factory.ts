import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import Notification from '#models/notification'
import { UserFactory } from '#database/factories/user_factory'

export const NotificationFactory = factory
  .define(Notification, ({ faker }) => {
    return {
      companyId: null,
      type: faker.helpers.arrayElement([
        'email_verified',
        'company_approved',
        'company_rejected',
        'booking_created',
        'booking_accepted',
        'booking_rejected',
        'booking_cancelled',
        'booking_expired',
        'new_booking_request',
      ]),
      title: faker.lorem.words(3),
      message: faker.lorem.sentence(),
      data: null,
      readAt: null,
    }
  })
  .state('read', (notification) => {
    notification.readAt = DateTime.now().minus({ days: 1 })
  })
  .state('unread', (notification) => {
    notification.readAt = null
  })
  .relation('user', () => UserFactory)
  .build()
