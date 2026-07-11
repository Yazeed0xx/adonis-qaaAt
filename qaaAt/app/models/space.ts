import { belongsTo, hasMany, hasOne } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, HasOne } from '@adonisjs/lucid/types/relations'
import { SpaceSchema } from '#database/schema'
import Company from '#models/company'
import Venue from '#models/venue'
import Hall from '#models/hall'
import SpaceCategory from '#models/space_category'
import SpaceEventDetail from '#models/space_event_detail'
import SpaceLayoutCapacity from '#models/space_layout_capacity'
import SpaceLargeFormatDetail from '#models/space_large_format_detail'
import SpaceAmenity from '#models/space_amenity'
import SpaceMedia from '#models/space_media'
import SpaceModerationEvent from '#models/space_moderation_event'

export default class Space extends SpaceSchema {
  get displayName() {
    return this.nameAr ?? this.nameEn ?? this.legacyName
  }
  get displayDescription() {
    return this.descriptionAr ?? this.descriptionEn ?? this.legacyDescription
  }
  get isLegacyOperationallyAvailable() {
    return this.legacyHallId === null || this.legacyIsAvailable === true
  }
  @belongsTo(() => Company) declare company: BelongsTo<typeof Company>
  @belongsTo(() => Venue) declare venue: BelongsTo<typeof Venue>
  @belongsTo(() => Hall, { foreignKey: 'legacyHallId' }) declare legacyHall: BelongsTo<typeof Hall>
  @belongsTo(() => SpaceCategory, { foreignKey: 'categoryId' }) declare category: BelongsTo<
    typeof SpaceCategory
  >
  @hasOne(() => SpaceEventDetail) declare eventDetails: HasOne<typeof SpaceEventDetail>
  @hasMany(() => SpaceLayoutCapacity) declare layoutCapacities: HasMany<typeof SpaceLayoutCapacity>
  @hasOne(() => SpaceLargeFormatDetail) declare largeFormatDetails: HasOne<
    typeof SpaceLargeFormatDetail
  >
  @hasMany(() => SpaceAmenity) declare amenities: HasMany<typeof SpaceAmenity>
  @hasMany(() => SpaceMedia) declare media: HasMany<typeof SpaceMedia>
  @hasMany(() => SpaceModerationEvent) declare moderationEvents: HasMany<
    typeof SpaceModerationEvent
  >
}
