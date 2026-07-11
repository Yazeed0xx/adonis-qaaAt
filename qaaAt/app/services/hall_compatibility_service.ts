import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Hall from '#models/hall'
import Space from '#models/space'
import Venue from '#models/venue'
import { toDatabaseAmount } from '#lib/money'
import type { HallInput } from '#services/hall_service'

const knownAmenities = new Set([
  'parking',
  'wifi',
  'catering',
  'sound_system',
  'projector',
  'video_conferencing',
  'whiteboard',
  'soundproofing',
])

export class HallCompatibilityService {
  async create(companyId: number, data: HallInput) {
    return db.transaction(async (trx) => {
      const hall = await Hall.create(
        {
          ...data,
          pricing: toDatabaseAmount(data.pricing),
          companyId,
          isAvailable: data.isAvailable ?? true,
        },
        { client: trx }
      )
      await this.sync(trx, hall)
      return hall
    })
  }

  async update(hallId: number, companyId: number, data: Partial<HallInput>) {
    return db.transaction(async (trx) => {
      const hall = await Hall.query({ client: trx })
        .where('id', hallId)
        .where('companyId', companyId)
        .whereNull('deletedAt')
        .forUpdate()
        .firstOrFail()
      hall.useTransaction(trx)
      hall.merge({
        ...data,
        pricing: data.pricing !== undefined ? toDatabaseAmount(data.pricing) : undefined,
      })
      await hall.save()
      await this.sync(trx, hall)
      return hall
    })
  }

  async archive(hallId: number, companyId: number) {
    return db.transaction(async (trx) => {
      const hall = await Hall.query({ client: trx })
        .where('id', hallId)
        .where('companyId', companyId)
        .whereNull('deletedAt')
        .forUpdate()
        .firstOrFail()
      const now = DateTime.now()
      hall.useTransaction(trx)
      hall.deletedAt = now
      await hall.save()
      const space = await Space.query({ client: trx })
        .where('legacyHallId', hall.id)
        .where('companyId', companyId)
        .forUpdate()
        .first()
      if (space) {
        const previous = space.publicationStatus
        space.useTransaction(trx)
        space.publicationStatus = 'archived'
        space.deletedAt = now
        await space.save()
        await trx.table('space_moderation_events').insert({
          space_id: space.id,
          company_id: companyId,
          actor_user_id: null,
          action: 'legacy_hall_archived',
          previous_status: previous,
          next_status: 'archived',
          metadata: { legacyHallId: hall.id },
          created_at: now.toSQL(),
        })
      }
      return hall
    })
  }

  private async sync(trx: any, hall: Hall) {
    let space = await Space.query({ client: trx })
      .where('legacyHallId', hall.id)
      .where('companyId', hall.companyId)
      .forUpdate()
      .first()
    if (!space) {
      const category = await trx
        .from('space_categories')
        .where('slug', 'wedding_hall')
        .firstOrFail()
      const venue = await Venue.create(
        {
          companyId: hall.companyId,
          nameAr: null,
          nameEn: null,
          legacyName: hall.name,
          city: hall.city,
          legacyLocation: hall.location,
          legacyAddress: hall.address,
          verificationStatus: 'unverified',
        },
        { client: trx }
      )
      space = await Space.create(
        {
          companyId: hall.companyId,
          venueId: venue.id,
          categoryId: category.id,
          legacyHallId: hall.id,
          nameAr: null,
          nameEn: null,
          legacyName: hall.name,
          descriptionAr: null,
          descriptionEn: null,
          legacyDescription: hall.description,
          bookingMode: 'quote_required',
          publicationStatus: 'published',
          capacityTotal: hall.capacity,
          requiresVisit: true,
          legacyIsAvailable: hall.isAvailable,
          publishedAt: hall.createdAt,
          publishedBy: null,
        },
        { client: trx }
      )
      await trx.table('space_moderation_events').insert({
        space_id: space.id,
        company_id: hall.companyId,
        actor_user_id: null,
        action: 'legacy_hall_created',
        previous_status: null,
        next_status: 'published',
        metadata: { legacyHallId: hall.id },
        created_at: DateTime.now().toSQL(),
      })
      await trx.table('space_availability_policies').insert({
        company_id: hall.companyId,
        space_id: space.id,
        mode: 'hourly',
        slot_increment_minutes: 120,
        minimum_duration_minutes: 120,
        maximum_duration_minutes: 720,
        maximum_advance_days: 365,
        source: 'legacy_migrated',
        created_at: DateTime.now().toSQL(),
      })
      await trx.table('space_operating_hours').insert(
        Array.from({ length: 7 }, (_, weekday) => ({
          company_id: hall.companyId,
          space_id: space!.id,
          weekday,
          opens_at_local: '08:00',
          closes_at_local: '22:00',
          created_at: DateTime.now().toSQL(),
        }))
      )
    } else {
      const venue = await Venue.query({ client: trx })
        .where('id', space.venueId)
        .where('companyId', hall.companyId)
        .forUpdate()
        .firstOrFail()
      venue.useTransaction(trx)
      venue.merge({
        legacyName: hall.name,
        city: hall.city,
        legacyLocation: hall.location,
        legacyAddress: hall.address,
      })
      await venue.save()
      space.useTransaction(trx)
      space.merge({
        legacyName: hall.name,
        legacyDescription: hall.description,
        capacityTotal: hall.capacity,
        legacyIsAvailable: hall.isAvailable,
      })
      await space.save()
    }

    if (hall.amenities && typeof hall.amenities === 'object') {
      const enabled = Object.entries(hall.amenities)
        .filter(([slug, value]) => knownAmenities.has(slug) && value === true)
        .map(([slug]) => slug)
      const definitions = enabled.length
        ? await trx.from('amenity_definitions').whereIn('slug', enabled).select('id')
        : []
      await trx.from('space_amenities').where('space_id', space.id).delete()
      if (definitions.length)
        await trx.table('space_amenities').insert(
          definitions.map((item: any) => ({
            space_id: space!.id,
            amenity_definition_id: item.id,
            created_at: DateTime.now().toSQL(),
          }))
        )
    }

    if (hall.images) {
      await trx
        .from('space_media')
        .where('space_id', space.id)
        .where('provenance', 'legacy_imported')
        .delete()
      for (const [index, reference] of hall.images.entries())
        await trx.table('space_media').insert({
          space_id: space.id,
          media_type: 'image',
          legacy_reference: reference,
          provenance: 'legacy_imported',
          sort_order: index,
          is_cover: index === 0,
          moderation_status: 'approved',
          created_at: DateTime.now().toSQL(),
        })
    }
    return space
  }
}
