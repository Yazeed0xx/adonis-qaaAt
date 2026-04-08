import env from '#start/env'
import { defineConfig, drivers, exponentialBackoff } from '@adonisjs/queue'

export default defineConfig({
  default: env.get('QUEUE_DRIVER', 'sync'),

  adapters: {
    sync: drivers.sync(),
    database: drivers.database({
      connectionName: 'postgres',
    }),
  },

  worker: {
    concurrency: 5,
    idleDelay: '2s',
    gracefulShutdown: true,
  },

  retry: {
    maxRetries: 3,
    backoff: exponentialBackoff({ baseDelay: '1s', maxDelay: '1m' }),
  },

  queues: {
    emails: {
      retry: {
        maxRetries: 5,
        backoff: exponentialBackoff({ baseDelay: '2s', maxDelay: '5m' }),
      },
    },
    notifications: {
      retry: {
        maxRetries: 4,
        backoff: exponentialBackoff({ baseDelay: '1s', maxDelay: '2m' }),
      },
    },
  },

  locations: ['./app/jobs/**/*.{ts,js}'],
})
