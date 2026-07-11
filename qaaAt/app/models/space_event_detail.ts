import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { SpaceEventDetailSchema } from '#database/schema'
import Space from '#models/space'
export default class SpaceEventDetail extends SpaceEventDetailSchema {
  @belongsTo(() => Space) declare space: BelongsTo<typeof Space>
}
