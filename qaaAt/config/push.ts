import env from '#start/env'

const enabled = env.get('PUSH_NOTIFICATIONS_ENABLED', false)
const accessToken = env.get('EXPO_PUSH_ACCESS_TOKEN')

if (enabled && !accessToken) {
  throw new Error('EXPO_PUSH_ACCESS_TOKEN is required when push notifications are enabled')
}

export default {
  enabled,
  accessToken,
  maxAttempts: env.get('PUSH_MAX_ATTEMPTS', 5),
  receiptDelayMinutes: env.get('PUSH_RECEIPT_DELAY_MINUTES', 15),
  receiptCutoffHours: env.get('PUSH_RECEIPT_CUTOFF_HOURS', 23),
}
