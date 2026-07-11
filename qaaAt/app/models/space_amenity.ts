import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { SpaceAmenitySchema } from '#database/schema'
import Space from '#models/space'
import AmenityDefinition from '#models/amenity_definition'
export default class SpaceAmenity extends SpaceAmenitySchema {
  @belongsTo(() => Space) declare space: BelongsTo<typeof Space>
  @belongsTo(() => AmenityDefinition) declare amenityDefinition: BelongsTo<typeof AmenityDefinition>
}
