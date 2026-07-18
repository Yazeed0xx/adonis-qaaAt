import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import { CompanyFactory } from '#database/factories/company_factory'
import { UserFactory } from '#database/factories/user_factory'
import { seedReferenceData } from '#database/seeding/reference_data'
import { DateTime } from 'luxon'
import { responseIds } from '#tests/support/responses'

const FIXED_NOW = DateTime.fromISO('2026-06-15T09:00:00.000Z')

async function base() {
  await seedReferenceData()
  const owner = await UserFactory.apply('company', 'verified').create()
  const company = await CompanyFactory.apply('approved')
    .merge({ userId: owner.id })
    .with('companyProfile')
    .create()
  const category = await db.from('space_categories').where('slug', 'meeting_room').firstOrFail()
  const [venue] = await db
    .table('venues')
    .insert({
      company_id: company.id,
      name_ar: 'مركز الرياض',
      name_en: 'Riyadh Center',
      city: 'Riyadh',
      timezone: 'Asia/Riyadh',
      verification_status: 'unverified',
    })
    .returning('*')
  return { company, category, venue }
}

async function addSpace(
  baseData: Awaited<ReturnType<typeof base>>,
  values: Record<string, unknown>
) {
  const [space] = await db
    .table('spaces')
    .insert({
      company_id: baseData.company.id,
      venue_id: baseData.venue.id,
      category_id: baseData.category.id,
      name_en: 'Space',
      booking_mode: 'request_to_book',
      publication_status: 'published',
      capacity_total: 20,
      ...values,
    })
    .returning('*')
  return space
}

test.group('Public Space catalog', (group) => {
  group.each.setup(withTruncateIsolation)

  test('returns only safe published spaces and applies controlled public filters', async ({
    client,
    assert,
  }) => {
    await seedReferenceData()
    const owner = await UserFactory.apply('company', 'verified').create()
    const company = await CompanyFactory.apply('approved')
      .merge({ userId: owner.id })
      .with('companyProfile')
      .create()
    const category = await db.from('space_categories').where('slug', 'meeting_room').firstOrFail()
    const amenity = await db.from('amenity_definitions').where('slug', 'projector').firstOrFail()
    const [venue] = await db
      .table('venues')
      .insert({
        company_id: company.id,
        name_ar: 'مركز الرياض',
        name_en: 'Riyadh Center',
        city: 'Riyadh',
        timezone: 'Asia/Riyadh',
        verification_status: 'unverified',
      })
      .returning('*')
    const [published] = await db
      .table('spaces')
      .insert({
        company_id: company.id,
        venue_id: venue.id,
        category_id: category.id,
        name_ar: 'غرفة مجلس',
        name_en: 'Board Room',
        description_ar: 'اجتماعات خاصة',
        booking_mode: 'request_to_book',
        publication_status: 'published',
        capacity_total: 24,
      })
      .returning('*')
    await db.table('spaces').insert({
      company_id: company.id,
      venue_id: venue.id,
      category_id: category.id,
      name_en: 'Draft leak',
      booking_mode: 'request_to_book',
      publication_status: 'draft',
      capacity_total: 100,
    })
    await db
      .table('space_amenities')
      .insert({ space_id: published.id, amenity_definition_id: amenity.id })
    await db.table('rate_plans').insert([
      {
        company_id: company.id,
        space_id: published.id,
        name_en: 'Public',
        pricing_mode: 'hourly',
        price_minor: '12500',
        is_active: true,
      },
      {
        company_id: company.id,
        space_id: published.id,
        name_en: 'Hidden',
        pricing_mode: 'full_day',
        price_minor: '1',
        is_active: false,
      },
    ])

    const response = await client.get(
      '/api/spaces?q=اجتماعات&category=meeting_room&city=riyadh&capacity=20&amenities=projector&pricingMode=hourly&minimumPriceMinor=12000&maximumPriceMinor=13000&limit=10'
    )
    response.assertStatus(200)
    assert.lengthOf(response.body().data, 1)
    response.assertBodyContains({
      data: [
        {
          id: published.id,
          name: 'غرفة مجلس',
          category: { slug: 'meeting_room' },
          amenities: ['projector'],
          pricing: { startingPriceMinor: '12500', currency: 'SAR', supportedModes: ['hourly'] },
        },
      ],
      meta: { page: 1, limit: 10 },
    })
    assert.notProperty(response.body().data[0], 'companyId')
  })

  test('rejects unknown controlled slugs and invalid ranges', async ({ client }) => {
    await seedReferenceData()
    const category = await client.get('/api/spaces?category=not_real')
    category.assertStatus(422)
    category.assertBodyContains({ error: { code: 'SPACE_CATEGORY_INVALID' } })
    const amenity = await client.get('/api/spaces?amenities=not_real')
    amenity.assertStatus(422)
    amenity.assertBodyContains({ error: { code: 'SPACE_AMENITY_INVALID' } })
    const range = await client.get('/api/spaces?from=2026-07-20T10:00:00%2B03:00')
    range.assertStatus(422)
    range.assertBodyContains({ error: { code: 'AVAILABILITY_RANGE_INVALID' } })
  })

  test('excludes every non-public Space and owner state', async ({ client, assert }) => {
    const data = await base()
    const published = await addSpace(data, { name_en: 'Visible' })
    for (const publicationStatus of [
      'draft',
      'pending_review',
      'changes_requested',
      'suspended',
      'archived',
    ])
      await addSpace(data, { name_en: publicationStatus, publication_status: publicationStatus })
    await addSpace(data, { name_en: 'Deleted space', deleted_at: FIXED_NOW.toSQL() })
    const [deletedVenue] = await db
      .table('venues')
      .insert({
        company_id: data.company.id,
        name_en: 'Deleted venue',
        city: 'Riyadh',
        timezone: 'Asia/Riyadh',
        verification_status: 'unverified',
        deleted_at: FIXED_NOW.toSQL(),
      })
      .returning('*')
    await addSpace(data, { name_en: 'Deleted venue space', venue_id: deletedVenue.id })
    const pendingOwner = await UserFactory.apply('company', 'verified').create()
    const pendingCompany = await CompanyFactory.merge({
      userId: pendingOwner.id,
      status: 'pending',
    })
      .with('companyProfile')
      .create()
    const [pendingVenue] = await db
      .table('venues')
      .insert({
        company_id: pendingCompany.id,
        name_en: 'Pending venue',
        city: 'Riyadh',
        timezone: 'Asia/Riyadh',
        verification_status: 'unverified',
      })
      .returning('*')
    await db.table('spaces').insert({
      company_id: pendingCompany.id,
      venue_id: pendingVenue.id,
      category_id: data.category.id,
      name_en: 'Pending company space',
      booking_mode: 'request_to_book',
      publication_status: 'published',
      capacity_total: 20,
    })
    const response = await client.get('/api/spaces?limit=50')
    response.assertStatus(200)
    assert.deepEqual(responseIds(response.body()), [published.id])
  })

  test('discovers every controlled MVP category through the category-aware query', async ({
    client,
    assert,
  }) => {
    const data = await base()
    const categories = await db.from('space_categories').where('is_active', true).orderBy('slug')
    for (const category of categories) {
      const space = await addSpace(data, { category_id: category.id, name_en: category.slug })
      const response = await client.get(`/api/spaces?category=${category.slug}`)
      response.assertStatus(200)
      assert.deepEqual(responseIds(response.body()), [space.id])
    }
    assert.includeMembers(
      categories.map((item) => item.slug),
      [
        'wedding_hall',
        'meeting_room',
        'training_room',
        'workshop_room',
        'seminar_space',
        'conference_space',
        'graduation_venue',
        'exhibition_space',
        'private_event_venue',
        'multipurpose_space',
      ]
    )
  })
})
