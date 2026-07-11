import { BaseSchema } from '@adonisjs/lucid/schema'

const categories = [
  ['wedding_hall', 'قاعة زفاف', 'Wedding hall'],
  ['private_event_venue', 'مكان فعالية خاصة', 'Private event venue'],
  ['meeting_room', 'غرفة اجتماعات', 'Meeting room'],
  ['training_room', 'غرفة تدريب', 'Training room'],
  ['workshop_room', 'غرفة ورش عمل', 'Workshop room'],
  ['seminar_space', 'مساحة ندوة', 'Seminar space'],
  ['conference_space', 'مساحة مؤتمر', 'Conference space'],
  ['graduation_venue', 'مكان تخرج', 'Graduation venue'],
  ['exhibition_space', 'مساحة معرض', 'Exhibition space'],
  ['multipurpose_space', 'مساحة متعددة الاستخدام', 'Multipurpose space'],
]

const amenities = [
  ['parking', 'مواقف سيارات', 'Parking', 'access'],
  ['wifi', 'واي فاي', 'Wi-Fi', 'technology'],
  ['catering', 'خدمات ضيافة', 'Catering', 'hospitality'],
  ['sound_system', 'نظام صوتي', 'Sound system', 'technology'],
  ['projector', 'جهاز عرض', 'Projector', 'technology'],
  ['video_conferencing', 'اجتماعات مرئية', 'Video conferencing', 'technology'],
  ['whiteboard', 'سبورة', 'Whiteboard', 'equipment'],
  ['soundproofing', 'عزل صوتي', 'Soundproofing', 'facility'],
]

export default class extends BaseSchema {
  async up() {
    const now = new Date()
    await this.db
      .table('space_categories')
      .insert(
        categories.map(([slug, nameAr, nameEn], index) => ({
          slug,
          name_ar: nameAr,
          name_en: nameEn,
          sort_order: index,
          created_at: now,
        }))
      )
      .onConflict('slug')
      .ignore()
    await this.db
      .table('amenity_definitions')
      .insert(
        amenities.map(([slug, nameAr, nameEn, group]) => ({
          slug,
          name_ar: nameAr,
          name_en: nameEn,
          group,
          created_at: now,
        }))
      )
      .onConflict('slug')
      .ignore()

    const wedding = await this.db
      .from('space_categories')
      .where('slug', 'wedding_hall')
      .firstOrFail()
    const amenityRows = await this.db.from('amenity_definitions').select('id', 'slug')
    const amenityIds = new Map(amenityRows.map((row) => [row.slug, row.id]))
    const halls = await this.db.from('halls').orderBy('id', 'asc')

    for (const hall of halls) {
      const mapped = await this.db.from('spaces').where('legacy_hall_id', hall.id).first()
      if (mapped) continue
      await this.db.transaction(async (trx) => {
        const [venue] = await trx
          .table('venues')
          .insert({
            company_id: hall.company_id,
            legacy_name: hall.name,
            city: hall.city,
            legacy_location: hall.location,
            legacy_address: hall.address,
            created_at: hall.created_at ?? now,
            updated_at: hall.updated_at,
            deleted_at: hall.deleted_at,
          })
          .returning('id')
        const [space] = await trx
          .table('spaces')
          .insert({
            company_id: hall.company_id,
            venue_id: venue.id,
            category_id: wedding.id,
            legacy_hall_id: hall.id,
            legacy_name: hall.name,
            legacy_description: hall.description,
            booking_mode: 'quote_required',
            publication_status: hall.deleted_at ? 'archived' : 'published',
            capacity_total: hall.capacity,
            requires_visit: true,
            legacy_is_available: hall.is_available,
            published_at: hall.deleted_at ? null : (hall.created_at ?? now),
            created_at: hall.created_at ?? now,
            updated_at: hall.updated_at,
            deleted_at: hall.deleted_at,
          })
          .returning('id')

        const hallAmenities =
          typeof hall.amenities === 'string' ? JSON.parse(hall.amenities) : hall.amenities
        if (hallAmenities && typeof hallAmenities === 'object') {
          const ids = Object.entries(hallAmenities)
            .filter(([, enabled]) => enabled === true)
            .map(([slug]) => amenityIds.get(slug))
            .filter(Boolean)
          if (ids.length)
            await trx.table('space_amenities').insert(
              ids.map((id) => ({
                space_id: space.id,
                amenity_definition_id: id,
                created_at: now,
              }))
            )
        }

        const images = typeof hall.images === 'string' ? JSON.parse(hall.images) : hall.images
        if (Array.isArray(images)) {
          for (const [index, reference] of images.entries()) {
            if (typeof reference !== 'string' || !reference) continue
            await trx.table('space_media').insert({
              space_id: space.id,
              media_type: 'image',
              legacy_reference: reference,
              provenance: 'legacy_imported',
              sort_order: index,
              is_cover: index === 0,
              moderation_status: 'approved',
              created_at: now,
            })
          }
        }
        await trx.table('space_moderation_events').insert({
          space_id: space.id,
          company_id: hall.company_id,
          actor_user_id: null,
          action: 'legacy_backfill',
          previous_status: null,
          next_status: hall.deleted_at ? 'archived' : 'published',
          metadata: { legacyHallId: hall.id, legacyIsAvailable: hall.is_available },
          created_at: now,
        })
      })
    }
  }

  async down() {
    await this.db.from('space_moderation_events').where('action', 'legacy_backfill').delete()
    await this.db.from('spaces').whereNotNull('legacy_hall_id').delete()
    await this.db.from('venues').whereNotNull('legacy_name').delete()
  }
}
