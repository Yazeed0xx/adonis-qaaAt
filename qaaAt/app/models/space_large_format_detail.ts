import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { SpaceLargeFormatDetailSchema } from '#database/schema'
import Space from '#models/space'
export default class SpaceLargeFormatDetail extends SpaceLargeFormatDetailSchema {
  @belongsTo(() => Space) declare space: BelongsTo<typeof Space>
}
