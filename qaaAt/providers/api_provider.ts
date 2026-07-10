import { HttpContext } from '@adonisjs/core/http'
import type { SimplePaginatorMetaKeys } from '@adonisjs/lucid/types/querybuilder'
import { BaseSerializer } from '@adonisjs/core/transformers'

export class ApiSerializer extends BaseSerializer<{
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
