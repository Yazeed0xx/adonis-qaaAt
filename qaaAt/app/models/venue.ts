import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { VenueSchema } from '#database/schema'
import Company from '#models/company'
import Space from '#models/space'

export default class Venue extends VenueSchema {
  get displayName() {
    return this.nameAr ?? this.nameEn ?? this.legacyName
  }
  @belongsTo(() => Company) declare company: BelongsTo<typeof Company>
  @hasMany(() => Space) declare spaces: HasMany<typeof Space>
}
