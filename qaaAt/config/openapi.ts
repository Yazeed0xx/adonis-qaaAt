import { defineConfig } from '@outloud/adonis-openapi'
import env from '#start/env'
import app from '@adonisjs/core/services/app'

export default defineConfig({
  enabled: !app.inProduction || env.get('OPENAPI_ENABLED', false),
  provider: 'scalar',
  endpoints: { ui: '/docs', spec: '/openapi.json' },
  document: {
    info: {
      title: 'QaaAt API',
      version: '1.0.0',
      description: 'OpenAPI documentation for the QaaAt hall booking platform',
    },
    servers: [{ url: env.get('APP_URL') }],
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer' },
      },
    },
  },
  generator: {
    resolve: import.meta.resolve,
    routes: true,
  },
})
