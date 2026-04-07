import { BaseSerializer } from '@adonisjs/core/transformers'

class ApiSerializer extends BaseSerializer<{
  PaginationMetaData: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
    firstPage: number
    firstPageUrl: string | null
    lastPageUrl: string | null
    nextPageUrl: string | null
    previousPageUrl: string | null
  }
}> {
  wrap = undefined

  definePaginationMetaData(metaData: unknown) {
    if (!this.isLucidPaginatorMetaData(metaData)) {
      return {
        total: 0,
        perPage: 0,
        currentPage: 1,
        lastPage: 1,
        firstPage: 1,
        firstPageUrl: null,
        lastPageUrl: null,
        nextPageUrl: null,
        previousPageUrl: null,
      }
    }

    return {
      total: Number(metaData.total),
      perPage: Number(metaData.perPage),
      currentPage: Number(metaData.currentPage),
      lastPage: Number(metaData.lastPage),
      firstPage: Number(metaData.firstPage),
      firstPageUrl: metaData.firstPageUrl,
      lastPageUrl: metaData.lastPageUrl,
      nextPageUrl: metaData.nextPageUrl,
      previousPageUrl: metaData.previousPageUrl,
    }
  }
}

export default new ApiSerializer()
