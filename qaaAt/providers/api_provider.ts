import { HttpContext } from '@adonisjs/core/http'
import type { SimplePaginatorMetaKeys } from '@adonisjs/lucid/types/querybuilder'
import {
  LUCID_PAGINATOR_METADATA_SCHEMA,
  OpenAPISerializer,
  type PaginationMetadataSchema,
} from '@foadonis/openapi/transformers'

export class ApiSerializer extends OpenAPISerializer<{
  Wrap: 'data'
  PaginationMetaData: SimplePaginatorMetaKeys
}> {
  wrap: 'data' = 'data'

  definePaginationMetaData(metaData: unknown): SimplePaginatorMetaKeys {
    if (!this.isLucidPaginatorMetaData(metaData)) {
      throw new Error(
        'Invalid pagination metadata. Expected metadata to contain Lucid pagination keys'
      )
    }

    return metaData
  }

  definePaginationMetaDataSchema(): PaginationMetadataSchema<SimplePaginatorMetaKeys> {
    return LUCID_PAGINATOR_METADATA_SCHEMA
  }
}

export const serializer = new ApiSerializer()
const serialize = serializer.serialize.bind(serializer) as ApiSerializer['serialize'] & {
  withoutWrapping: ApiSerializer['serializeWithoutWrapping']
}

serialize.withoutWrapping = serializer.serializeWithoutWrapping.bind(serializer)

HttpContext.instanceProperty('serialize', serialize)

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    serialize: typeof serialize
  }
}
