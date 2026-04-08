import { belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { ApiProperty, ApiPropertyOptional } from '@foadonis/openapi/decorators'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import { HallSchema } from '#database/schema'
import Company from '#models/company'
import Booking from '#models/booking'

export default class Hall extends HallSchema {
  @ApiProperty({ type: Number })
  declare id: number

  @ApiProperty({ type: String })
  declare name: string

  @ApiPropertyOptional({ type: String })
  declare description: string | null

  @ApiProperty({ type: Number })
  declare capacity: number

  @ApiProperty({ type: String })
  declare location: string

  @column({
    prepare: (value: Record<string, any> | null) => (value ? JSON.stringify(value) : null),
    consume: (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : (value ?? null)),
  })
  @ApiPropertyOptional({
    schema: {
      type: 'object',
      additionalProperties: true,
      nullable: true,
    },
  })
  declare amenities: Record<string, any> | null

  @ApiProperty({ type: Number })
  declare pricing: string

  @column({
    prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : (value ?? null)),
  })
  @ApiPropertyOptional({ type: [String] })
  declare images: string[] | null

  @ApiProperty({ type: String })
  declare address: string

  @ApiProperty({ type: String })
  declare city: string

  @column({
    prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : (value ?? null)),
  })
  @ApiPropertyOptional({ type: [String] })
  declare services: string[] | null

  @ApiProperty({ type: Boolean })
  declare isAvailable: boolean

  @ApiProperty({ type: String, format: 'date-time' })
  declare createdAt: DateTime

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  declare updatedAt: DateTime | null

  @belongsTo(() => Company)
  @ApiPropertyOptional({ type: () => Company })
  declare company: BelongsTo<typeof Company>

  @hasMany(() => Booking)
  declare bookings: HasMany<typeof Booking>
}
