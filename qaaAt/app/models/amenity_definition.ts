import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { AmenityDefinitionSchema } from '#database/schema'
import SpaceAmenity from '#models/space_amenity'
export default class AmenityDefinition extends AmenityDefinitionSchema {
  @hasMany(() => SpaceAmenity) declare spaceAmenities: HasMany<typeof SpaceAmenity>
}
