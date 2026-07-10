import env from '#start/env'
import { defineConfig, stores } from '@adonisjs/limiter'
import app from '@adonisjs/core/services/app'

const defaultStore = env.get('LIMITER_STORE', app.inProduction ? 'database' : 'memory')

if (app.inProduction && defaultStore !== 'database') {
  throw new Error('LIMITER_STORE must be database in production')
}

const limiterConfig = defineConfig({
  default: defaultStore,

  stores: {
    database: stores.database({
      connectionName: 'postgres',
      tableName: 'rate_limits',
    }),
    memory: stores.memory({}),
  },
})

export default limiterConfig

declare module '@adonisjs/limiter/types' {
  export interface LimitersList extends InferLimiters<typeof limiterConfig> {}
}
