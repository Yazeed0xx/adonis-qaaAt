import { defineConfig } from '@foadonis/openapi'
import { TransformerTypeLoader } from '@foadonis/openapi/transformers'
import { serializer } from '#providers/api_provider'

export default defineConfig({
  ui: 'scalar',
  document: {
    info: {
      title: 'QaaAt API',
      version: '1.0.0',
      description: 'OpenAPI documentation for the QaaAt hall booking platform',
    },
  },
  loaders: [TransformerTypeLoader({ serializer })],
})
