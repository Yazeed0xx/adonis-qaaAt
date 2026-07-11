import env from '#start/env'
import { defineConfig, drivers, exponentialBackoff } from '@adonisjs/queue'
import app from '@adonisjs/core/services/app'

const defaultDriver = env.get('QUEUE_DRIVER', app.inProduction ? 'database' : 'sync')

if (app.inProduction && defaultDriver !== 'database') {
  throw new Error('QUEUE_DRIVER must be database in production')
}

export default defineConfig({
  default: defaultDriver,

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
    push: {
      retry: {
        maxRetries: 2,
        backoff: exponentialBackoff({ baseDelay: '5s', maxDelay: '5m' }),
      },
    },
  },

  locations: ['./app/jobs/**/*.{ts,js}'],
})
