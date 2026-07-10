import CleanupExpiredBookingsJob from '#jobs/cleanup_expired_bookings_job'
import ProcessNotificationOutboxJob from '#jobs/process_notification_outbox_job'

if (process.env.NODE_ENV !== 'test') {
  await CleanupExpiredBookingsJob.schedule({}).every('1h').id('cleanup-expired-bookings')
  await ProcessNotificationOutboxJob.schedule({}).every('1m').id('process-notification-outbox')
}
