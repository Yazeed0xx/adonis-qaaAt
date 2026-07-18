import CleanupExpiredBookingsJob from '#jobs/cleanup_expired_bookings_job'
import ProcessNotificationOutboxJob from '#jobs/process_notification_outbox_job'
import ProcessPushDeliveriesJob from '#jobs/process_push_deliveries_job'
import ProcessPushReceiptsJob from '#jobs/process_push_receipts_job'
import ReplayPaymentWebhooksJob from '#jobs/replay_payment_webhooks_job'
import ProcessSpaceMediaCleanupJob from '#jobs/process_space_media_cleanup_job'

if (process.env.NODE_ENV !== 'test') {
  await CleanupExpiredBookingsJob.schedule({}).every('1h').id('cleanup-expired-bookings')
  await ProcessNotificationOutboxJob.schedule({}).every('1m').id('process-notification-outbox')
  await ProcessPushDeliveriesJob.schedule({}).every('1m').id('process-push-deliveries')
  await ProcessPushReceiptsJob.schedule({}).every('5m').id('process-push-receipts')
  await ReplayPaymentWebhooksJob.schedule({}).every('1m').id('replay-payment-webhooks')
  await ProcessSpaceMediaCleanupJob.schedule({}).every('5m').id('process-space-media-cleanup')
}
