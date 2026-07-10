import { DateTime } from 'luxon'
import { BookingFactory } from '#database/factories/booking_factory'
import { createBookingWithServices } from '#database/factories/recipes'
import type { DemoScenarioContext } from '#database/seeding/scenario_context'

export async function seedBookings(context: DemoScenarioContext) {
  const { mohammed, sara, ahmed } = context.users
  const { royalGrand, royalGarden, goldenBallroom, pearlHall } = context.halls
  const { royalDecoration, royalPhotography, goldenDecoration } = context.services

  if (
    !mohammed ||
    !sara ||
    !ahmed ||
    !royalGrand ||
    !royalGarden ||
    !goldenBallroom ||
    !pearlHall ||
    !royalDecoration ||
    !royalPhotography ||
    !goldenDecoration
  ) {
    throw new Error('Accounts and inventory must be seeded before bookings')
  }

  const pending = await createBookingWithServices({
    states: ['pending'],
    bookingData: {
      userId: mohammed.id,
      hallId: royalGrand.id,
      bookingDate: DateTime.now().plus({ days: 45 }),
      startTime: '18:00',
      endTime: '23:00',
      totalPrice: '25000',
      specialRequests: 'Please arrange for valet parking and extra seating near the stage.',
    },
    serviceRecords: [royalDecoration, royalPhotography],
  })

  const accepted = await createBookingWithServices({
    states: ['accepted'],
    bookingData: {
      userId: sara.id,
      hallId: goldenBallroom.id,
      bookingDate: DateTime.now().plus({ days: 30 }),
      startTime: '19:00',
      endTime: '23:00',
      totalPrice: '18000',
    },
  })

  const confirmed = await createBookingWithServices({
    states: ['confirmed'],
    bookingData: {
      userId: mohammed.id,
      hallId: pearlHall.id,
      bookingDate: DateTime.now().plus({ days: 60 }),
      startTime: '14:00',
      endTime: '18:00',
      totalPrice: '14000',
    },
    serviceRecords: [goldenDecoration],
  })

  await BookingFactory.apply('rejected')
    .merge({
      userId: ahmed.id,
      hallId: royalGrand.id,
      bookingDate: DateTime.now().plus({ days: 20 }),
      startTime: '18:00',
      endTime: '22:00',
      totalPrice: '25000',
      rejectionReason:
        'The hall is already booked for a private event on this date. Please consider alternative dates.',
    })
    .create()

  await BookingFactory.apply('cancelled')
    .merge({
      userId: sara.id,
      hallId: royalGarden.id,
      bookingDate: DateTime.now().plus({ days: 15 }),
      startTime: '16:00',
      endTime: '20:00',
      totalPrice: '10000',
    })
    .create()

  await BookingFactory.apply('completed')
    .merge({
      userId: mohammed.id,
      hallId: goldenBallroom.id,
      startTime: '19:00',
      endTime: '23:00',
      totalPrice: '22500',
    })
    .create()

  await BookingFactory.apply('expired')
    .merge({
      userId: ahmed.id,
      hallId: pearlHall.id,
      bookingDate: DateTime.now().plus({ days: 25 }),
      startTime: '18:00',
      endTime: '22:00',
      totalPrice: '14000',
    })
    .create()

  context.bookings.pending = pending
  context.bookings.accepted = accepted
  context.bookings.confirmed = confirmed
}
