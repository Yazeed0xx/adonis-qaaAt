import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import Booking from '#models/booking'
import { HallFactory } from '#database/factories/hall_factory'
import { UserFactory } from '#database/factories/user_factory'

export const BookingFactory = factory
  .define(Booking, ({ faker }) => {
    return {
      bookingDate: DateTime.now().plus({ days: faker.number.int({ min: 7, max: 60 }) }),
      startTime: '18:00',
      endTime: '22:00',
      status: 'pending',
      totalPrice: faker.number.int({ min: 8000, max: 25000 }).toString(),
      specialRequests: faker.lorem.sentence(),
      paymentStatus: 'unpaid',
      expiresAt: DateTime.now().plus({ days: 7 }),
    }
  })
  .state('pending', (booking) => {
    booking.status = 'pending'
    booking.paymentStatus = 'unpaid'
    booking.companyRespondedAt = null
    booking.paymentDueDate = null
    booking.rejectionReason = null
    booking.expiresAt = DateTime.now().plus({ days: 7 })
  })
  .state('accepted', (booking) => {
    booking.status = 'accepted'
    booking.paymentStatus = 'unpaid'
    booking.companyRespondedAt = DateTime.now().minus({ days: 2 })
    booking.paymentDueDate = DateTime.now().plus({ days: 1 })
    booking.expiresAt = DateTime.now().minus({ days: 5 })
  })
  .state('rejected', (booking, { faker }) => {
    booking.status = 'rejected'
    booking.rejectionReason = faker.lorem.sentence()
    booking.companyRespondedAt = DateTime.now().minus({ days: 2 })
    booking.expiresAt = DateTime.now().minus({ days: 5 })
  })
  .state('confirmed', (booking) => {
    booking.status = 'confirmed'
    booking.paymentStatus = 'paid'
    booking.companyRespondedAt = DateTime.now().minus({ days: 10 })
    booking.expiresAt = DateTime.now().minus({ days: 17 })
  })
  .state('cancelled', (booking) => {
    booking.status = 'cancelled'
    booking.paymentStatus = 'unpaid'
    booking.expiresAt = DateTime.now().minus({ days: 8 })
  })
  .state('completed', (booking) => {
    booking.status = 'completed'
    booking.bookingDate = DateTime.now().minus({ days: 10 })
    booking.paymentStatus = 'paid'
    booking.companyRespondedAt = DateTime.now().minus({ days: 25 })
    booking.expiresAt = DateTime.now().minus({ days: 32 })
  })
  .state('expired', (booking) => {
    booking.status = 'expired'
    booking.paymentStatus = 'unpaid'
    booking.expiresAt = DateTime.now().minus({ days: 1 })
  })
  .relation('user', () => UserFactory)
  .relation('hall', () => HallFactory)
  .build()
