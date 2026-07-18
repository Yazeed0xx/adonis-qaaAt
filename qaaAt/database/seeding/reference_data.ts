import db from '@adonisjs/lucid/services/db'

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
] as const

const amenities = [
  ['parking', 'مواقف سيارات', 'Parking', 'access'],
  ['wifi', 'واي فاي', 'Wi-Fi', 'technology'],
  ['catering', 'خدمات ضيافة', 'Catering', 'hospitality'],
  ['sound_system', 'نظام صوتي', 'Sound system', 'technology'],
  ['projector', 'جهاز عرض', 'Projector', 'technology'],
  ['video_conferencing', 'اجتماعات مرئية', 'Video conferencing', 'technology'],
  ['whiteboard', 'سبورة', 'Whiteboard', 'equipment'],
  ['soundproofing', 'عزل صوتي', 'Soundproofing', 'facility'],
] as const

export async function seedReferenceData() {
  await db.transaction(async (trx) => {
    const now = new Date()

    await trx
      .table('space_categories')
      .insert(
        categories.map(([slug, nameAr, nameEn], sortOrder) => ({
          slug,
          name_ar: nameAr,
          name_en: nameEn,
          sort_order: sortOrder,
          created_at: now,
        }))
      )
      .onConflict('slug')
      .ignore()

    await trx
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

    await trx.rawQuery(
      `
      INSERT INTO category_request_response_policies (category_id, created_at)
      SELECT id, ? FROM space_categories
      ON CONFLICT (category_id) DO NOTHING
    `,
      [now]
    )
  })
}
