/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  APP_NAME: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring mail
  |----------------------------------------------------------
  */
  RESEND_API_KEY: Env.schema.string.optional(),
  MAIL_FROM_ADDRESS: Env.schema.string.optional(),
  MAIL_FROM_NAME: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Application URL for email links
  |----------------------------------------------------------
  */
  APP_URL: Env.schema.string({ format: 'url' }),

  /*
  |----------------------------------------------------------
  | Variables for configuring queues
  |----------------------------------------------------------
  */
  QUEUE_DRIVER: Env.schema.enum.optional(['sync', 'database'] as const),

  PUSH_NOTIFICATIONS_ENABLED: Env.schema.boolean.optional(),
  EXPO_PUSH_ACCESS_TOKEN: Env.schema.string.optional(),
  PUSH_MAX_ATTEMPTS: Env.schema.number.optional(),
  PUSH_RECEIPT_DELAY_MINUTES: Env.schema.number.optional(),
  PUSH_RECEIPT_CUTOFF_HOURS: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring rate limiting
  |----------------------------------------------------------
  */
  LIMITER_STORE: Env.schema.enum.optional(['database', 'memory'] as const),

  /*
  |----------------------------------------------------------
  | Malware scanning
  |----------------------------------------------------------
  */
  MALWARE_SCANNER_COMMAND: Env.schema.string.optional(),

  PRIVATE_STORAGE_PATH: Env.schema.string.optional(),
  OPENAPI_ENABLED: Env.schema.boolean.optional(),
  PAYMENT_DRIVER: Env.schema.enum.optional(['fake'] as const),
  FAKE_PAYMENT_WEBHOOK_SECRET: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the drive package
  |----------------------------------------------------------
  */
  DRIVE_DISK: Env.schema.enum(['fs'] as const),
})
