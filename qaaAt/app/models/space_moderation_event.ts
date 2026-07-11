import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { SpaceModerationEventSchema } from '#database/schema'
import Space from '#models/space'
import User from '#models/user'
export default class SpaceModerationEvent extends SpaceModerationEventSchema {
  @belongsTo(() => Space) declare space: BelongsTo<typeof Space>
  @belongsTo(() => User, { foreignKey: 'actorUserId' }) declare actor: BelongsTo<typeof User>
}
