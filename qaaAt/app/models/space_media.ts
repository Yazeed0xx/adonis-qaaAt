import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { SpaceMediaSchema } from '#database/schema'
import Space from '#models/space'
export default class SpaceMedia extends SpaceMediaSchema {
  static table = 'space_media'

  @belongsTo(() => Space) declare space: BelongsTo<typeof Space>
}
