import CleanupExpiredBookingsJob from '#jobs/cleanup_expired_bookings_job'

if (process.env.NODE_ENV !== 'test') {
  await CleanupExpiredBookingsJob.schedule({}).every('1h').id('cleanup-expired-bookings')
}
