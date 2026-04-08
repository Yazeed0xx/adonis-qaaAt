import { ApiProperty } from '@foadonis/openapi/decorators'
import Hall from '#models/hall'

export class PaginationMetaSchema {
  @ApiProperty()
  declare total: number

  @ApiProperty()
  declare perPage: number

  @ApiProperty()
  declare currentPage: number

  @ApiProperty()
  declare lastPage: number

  @ApiProperty()
  declare firstPage: number

  @ApiProperty({ type: String, nullable: true })
  declare firstPageUrl: string | null

  @ApiProperty({ type: String, nullable: true })
  declare lastPageUrl: string | null

  @ApiProperty({ type: String, nullable: true })
  declare nextPageUrl: string | null

  @ApiProperty({ type: String, nullable: true })
  declare previousPageUrl: string | null
}

export class HallResourceResponseSchema {
  @ApiProperty({ type: Hall })
  declare data: Hall
}

export class HallPaginatedResponseSchema {
  @ApiProperty({ type: [Hall] })
  declare data: Hall[]

  @ApiProperty({ type: PaginationMetaSchema })
  declare meta: PaginationMetaSchema
}

export class HallMutationResponseSchema {
  @ApiProperty()
  declare message: string

  @ApiProperty({ type: Hall })
  declare data: Hall
}

export class HallDeleteResponseSchema {
  @ApiProperty()
  declare message: string
}

export class HallAvailabilitySlotSchema {
  @ApiProperty()
  declare startTime: string

  @ApiProperty()
  declare endTime: string

  @ApiProperty()
  declare isAvailable: boolean
}

export class HallAvailabilityDataSchema {
  @ApiProperty()
  declare hallId: number

  @ApiProperty()
  declare hallName: string

  @ApiProperty()
  declare date: string

  @ApiProperty({ type: [HallAvailabilitySlotSchema] })
  declare slots: HallAvailabilitySlotSchema[]
}

export class HallAvailabilityResponseSchema {
  @ApiProperty({ type: HallAvailabilityDataSchema })
  declare data: HallAvailabilityDataSchema
}

export class HallCitiesDataSchema {
  @ApiProperty({ type: [String] })
  declare cities: string[]
}

export class HallCitiesResponseSchema {
  @ApiProperty({ type: HallCitiesDataSchema })
  declare data: HallCitiesDataSchema
}
