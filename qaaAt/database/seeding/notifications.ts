import { DateTime } from 'luxon'
import { NotificationFactory } from '#database/factories/notification_factory'
import type { DemoScenarioContext } from '#database/seeding/scenario_context'

export async function seedNotifications(context: DemoScenarioContext) {
  const { mohammed, ahmed } = context.users
  const { royal, golden, quick } = context.companies
  const { accepted, pending } = context.bookings

  if (!mohammed || !ahmed || !royal || !golden || !quick || !accepted || !pending) {
    throw new Error('Accounts, companies, and bookings must be seeded before notifications')
  }

  await NotificationFactory.merge([
    {
      userId: mohammed.id,
      type: 'booking_accepted',
      title: 'Booking Confirmed',
      message:
        'Great news! Your booking for "Golden Ballroom" has been accepted. Please proceed with payment.',
      data: { bookingId: accepted.id, hallName: 'Golden Ballroom' },
      readAt: null,
    },
    {
      userId: mohammed.id,
      type: 'email_verified',
      title: 'Email Verified',
      message: 'Your email has been verified successfully. You can now make bookings.',
      data: null,
      readAt: DateTime.now().minus({ days: 5 }),
    },
    {
      userId: ahmed.id,
      type: 'booking_rejected',
      title: 'Booking Rejected',
      message: 'Unfortunately, your booking for "Royal Grand Hall" was rejected.',
      data: { hallName: 'Royal Grand Hall' },
      readAt: null,
    },
    {
      userId: ahmed.id,
      type: 'booking_expired',
      title: 'Booking Expired',
      message:
        'Your booking request for "Pearl Hall" has expired as the company did not respond.',
      data: { hallName: 'Pearl Hall' },
      readAt: null,
    },
    {
      userId: royal.userId,
      type: 'new_booking_request',
      title: 'New Booking Request',
      message:
        'You have a new booking request for "Royal Grand Hall" on ' +
        DateTime.now().plus({ days: 45 }).toFormat('yyyy-MM-dd'),
      data: { bookingId: pending.id, hallName: 'Royal Grand Hall' },
      readAt: null,
    },
    {
      userId: royal.userId,
      type: 'company_approved',
      title: 'Company Approved',
      message:
        'Congratulations! Your company "Royal Events Co." has been approved. You can now create halls.',
      data: null,
      readAt: DateTime.now().minus({ days: 30 }),
    },
    {
      userId: golden.userId,
      type: 'company_approved',
      title: 'Company Approved',
      message: 'Congratulations! Your company "Golden Palace Events" has been approved.',
      data: null,
      readAt: DateTime.now().minus({ days: 15 }),
    },
    {
      userId: quick.userId,
      type: 'company_rejected',
      title: 'Company Rejected',
      message:
        'Your company registration was rejected. Reason: Incomplete business documentation.',
      data: { reason: 'Incomplete business documentation' },
      readAt: null,
    },
  ]).createMany(8)
}
