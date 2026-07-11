import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { SpaceLayoutCapacitySchema } from '#database/schema'
import Space from '#models/space'
export default class SpaceLayoutCapacity extends SpaceLayoutCapacitySchema {
  @belongsTo(() => Space) declare space: BelongsTo<typeof Space>
}
