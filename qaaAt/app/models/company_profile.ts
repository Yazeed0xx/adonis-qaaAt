import { belongsTo, column } from '@adonisjs/lucid/orm'
import { ApiProperty, ApiPropertyOptional } from '@foadonis/openapi/decorators'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { CompanyProfileSchema } from '#database/schema'
import User from '#models/user'

export default class CompanyProfile extends CompanyProfileSchema {
  @ApiProperty({ type: Number })
  declare id: number

  @ApiProperty({ type: String })
  declare companyName: string

  @ApiPropertyOptional({ type: String })
  declare description: string | null

  @ApiPropertyOptional({ type: String })
  declare logo: string | null

  @ApiPropertyOptional({ type: String })
  declare banner: string | null

  @ApiPropertyOptional({ type: String })
  declare website: string | null

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
  declare socialLinks: Record<string, any> | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
