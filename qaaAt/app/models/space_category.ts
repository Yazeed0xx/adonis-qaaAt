import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { SpaceCategorySchema } from '#database/schema'
import Space from '#models/space'

export default class SpaceCategory extends SpaceCategorySchema {
  @hasMany(() => Space) declare spaces: HasMany<typeof Space>
}
