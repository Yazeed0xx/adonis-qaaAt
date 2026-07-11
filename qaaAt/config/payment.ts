import env from '#start/env'

const driver = env.get('PAYMENT_DRIVER')
if (env.get('NODE_ENV') === 'production' && driver === 'fake') {
  throw new Error('PAYMENT_DRIVER=fake is forbidden in production; configure an approved PSP')
}

export default {
  driver,
  fakeWebhookSecret: env.get('FAKE_PAYMENT_WEBHOOK_SECRET'),
  isFakeAllowed: env.get('NODE_ENV') !== 'production',
}
