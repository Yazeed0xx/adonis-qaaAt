import { belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { CompanyProfileSchema } from '#database/schema'
import User from '#models/user'

export default class CompanyProfile extends CompanyProfileSchema {
  declare id: number

  declare companyName: string

  declare description: string | null

  declare logo: string | null

  declare banner: string | null

  declare website: string | null

  @column({
    prepare: (value: Record<string, any> | null) => (value ? JSON.stringify(value) : null),
    consume: (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : (value ?? null)),
  })
  declare socialLinks: Record<string, any> | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
