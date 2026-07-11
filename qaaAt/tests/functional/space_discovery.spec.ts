import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { CompanyFactory } from '#database/factories/company_factory'
import { UserFactory } from '#database/factories/user_factory'
import { HallFactory } from '#database/factories/hall_factory'
import BackfillMigration from '#database/migrations/1770000000011_seed_catalogs_and_backfill_halls'
import { DateTime } from 'luxon'

async function base() {
  await new BackfillMigration(db.connection(), import.meta.url).up()
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

async function addSpace(baseData: Awaited<ReturnType<typeof base>>, values: Record<string, any>) {
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

async function countSqlQueries<T>(callback: () => Promise<T>) {
  const client = db.connection().getWriteClient()
  let count = 0
  const listener = () => count++
  client.on('query', listener)
  try {
    return { result: await callback(), count }
  } finally {
    client.off('query', listener)
  }
}

test.group('Public Space discovery', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('returns only safe published spaces and applies controlled public filters', async ({
    client,
    assert,
  }) => {
    await new BackfillMigration(db.connection(), import.meta.url).up()
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
    await new BackfillMigration(db.connection(), import.meta.url).up()
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

  test('excludes every non-public Space and owner state including legacy-ineligible mappings', async ({
    client,
    assert,
  }) => {
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
    await addSpace(data, { name_en: 'Deleted space', deleted_at: DateTime.now().toSQL() })
    const hall = await HallFactory.merge({
      companyId: data.company.id,
      isAvailable: false,
    }).create()
    await addSpace(data, {
      name_en: 'Legacy hidden',
      legacy_hall_id: hall.id,
      legacy_is_available: false,
    })
    const [deletedVenue] = await db
      .table('venues')
      .insert({
        company_id: data.company.id,
        name_en: 'Deleted venue',
        city: 'Riyadh',
        timezone: 'Asia/Riyadh',
        verification_status: 'unverified',
        deleted_at: DateTime.now().toSQL(),
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
    assert.deepEqual(
      response.body().data.map((item: any) => item.id),
      [published.id]
    )
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
      assert.deepEqual(
        response.body().data.map((item: any) => item.id),
        [space.id]
      )
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

  test('ranks exact, prefix, substring, and description matches deterministically', async ({
    client,
    assert,
  }) => {
    const data = await base()
    const description = await addSpace(data, {
      name_en: 'Newest unrelated',
      description_en: 'Pearl venue',
      created_at: DateTime.now().plus({ minutes: 4 }).toSQL(),
    })
    const substring = await addSpace(data, {
      name_en: 'Grand Pearl Room',
      created_at: DateTime.now().plus({ minutes: 3 }).toSQL(),
    })
    const prefix = await addSpace(data, {
      name_ar: 'Pearl Ballroom',
      name_en: null,
      created_at: DateTime.now().plus({ minutes: 2 }).toSQL(),
    })
    const exact = await addSpace(data, { name_en: 'Pearl', created_at: DateTime.now().toSQL() })
    const relevance = await client.get('/api/spaces?q=pearl&sort=relevance')
    relevance.assertStatus(200)
    assert.deepEqual(
      relevance.body().data.map((item: any) => item.id),
      [exact.id, prefix.id, substring.id, description.id]
    )
    const newest = await client.get('/api/spaces?q=pearl&sort=newest')
    assert.deepEqual(
      newest.body().data.map((item: any) => item.id),
      [description.id, substring.id, prefix.id, exact.id]
    )
    const missing = await client.get('/api/spaces?sort=relevance')
    missing.assertStatus(422)
    missing.assertBodyContains({ error: { code: 'RELEVANCE_QUERY_REQUIRED' } })
  })

  test('searches Arabic English and legacy text while treating wildcards literally', async ({
    client,
    assert,
  }) => {
    const data = await base()
    const arabic = await addSpace(data, { name_ar: 'قاعة اللؤلؤ', name_en: null })
    const english = await addSpace(data, { name_en: 'English Needle' })
    const legacy = await addSpace(data, { name_en: null, legacy_name: 'Legacy Needle' })
    const literal = await addSpace(data, { name_en: '100%_Hall\\Name' })
    for (const [query, id] of [
      ['اللؤلؤ', arabic.id],
      ['English', english.id],
      ['Legacy', legacy.id],
      ['%_Hall\\', literal.id],
    ] as const) {
      const response = await client.get('/api/spaces').qs({ q: query })
      response.assertStatus(200)
      assert.deepEqual(
        response.body().data.map((item: any) => item.id),
        [id]
      )
    }
  })

  test('keeps exact signed-bigint price filters and rejects noncanonical money', async ({
    client,
    assert,
  }) => {
    const data = await base()
    const exact = await addSpace(data, { name_en: 'Exact bigint' })
    const quote = await addSpace(data, { name_en: 'Quote only' })
    await db.table('rate_plans').insert([
      {
        company_id: data.company.id,
        space_id: exact.id,
        name_en: 'Huge',
        pricing_mode: 'full_day',
        price_minor: '9007199254740993',
        is_active: true,
      },
      {
        company_id: data.company.id,
        space_id: quote.id,
        name_en: 'Quote',
        pricing_mode: 'custom_quote',
        price_minor: null,
        is_active: true,
      },
    ])
    const response = await client.get(
      '/api/spaces?minimumPriceMinor=9007199254740993&maximumPriceMinor=9007199254740993'
    )
    response.assertStatus(200)
    assert.deepEqual(
      response.body().data.map((item: any) => item.id),
      [exact.id]
    )
    assert.equal(response.body().data[0].pricing.startingPriceMinor, '9007199254740993')
    for (const value of ['1.0', '-1', '+1', '1e3', ' 1', '9223372036854775808']) {
      const invalid = await client.get('/api/spaces').qs({ minimumPriceMinor: value })
      invalid.assertStatus(422)
    }
    const reversed = await client.get('/api/spaces?minimumPriceMinor=2&maximumPriceMinor=1')
    reversed.assertStatus(422)
    reversed.assertBodyContains({ error: { code: 'PRICE_RANGE_INVALID' } })
  })

  test('rejects fractional or out-of-bound capacity and pagination values', async ({ client }) => {
    await base()
    for (const query of [
      'capacity=0',
      'capacity=-1',
      'capacity=1.5',
      'capacity=1000001',
      'page=0',
      'page=1.5',
      'page=10001',
      'limit=0',
      'limit=1.5',
      'limit=51',
    ]) {
      const response = await client.get(`/api/spaces?${query}`)
      response.assertStatus(422)
      response.assertBodyContains({ error: { code: 'VALIDATION_ERROR' } })
    }
    const valid = await client.get('/api/spaces?capacity=1&page=10000&limit=50')
    valid.assertStatus(200)
  })

  test('availability pagination crosses candidate batches without gaps or false next pages', async ({
    client,
    assert,
  }) => {
    const data = await base()
    const available = []
    for (let index = 0; index < 25; index++)
      available.push(await addSpace(data, { name_en: `Available ${index}` }))
    const unavailableRows = Array.from({ length: 205 }, (_, index) => ({
      company_id: data.company.id,
      venue_id: data.venue.id,
      category_id: data.category.id,
      name_en: `Unavailable ${index}`,
      booking_mode: 'request_to_book',
      publication_status: 'published',
      capacity_total: 20,
    }))
    await db.table('spaces').multiInsert(unavailableRows)
    await db.table('space_availability_policies').multiInsert(
      available.map((space) => ({
        company_id: data.company.id,
        space_id: space.id,
        mode: 'full_day',
        slot_increment_minutes: 60,
        minimum_duration_minutes: 60,
        maximum_duration_minutes: 1440,
        minimum_notice_minutes: 0,
        maximum_advance_days: 365,
        preparation_buffer_minutes: 0,
        cleanup_buffer_minutes: 0,
        is_active: true,
      }))
    )
    const day = DateTime.now().setZone('Asia/Riyadh').plus({ days: 2 }).startOf('day')
    await db.table('space_operating_hours').multiInsert(
      available.map((space) => ({
        company_id: data.company.id,
        space_id: space.id,
        weekday: day.weekday % 7,
        opens_at_local: '08:00',
        closes_at_local: '18:00',
        ends_next_day: false,
        sort_order: 0,
      }))
    )
    const params = new URLSearchParams({
      from: day.toISO()!,
      to: day.plus({ days: 1 }).toISO()!,
      limit: '10',
    })
    const pages = []
    for (const page of [1, 2, 3, 4]) {
      const response = await client.get(`/api/spaces?${params}&page=${page}`)
      response.assertStatus(200)
      pages.push(response.body())
      assert.equal(response.body().meta.availabilityScan.batchesScanned, 2)
      assert.isAtMost(response.body().meta.availabilityScan.scannedCandidates, 400)
    }
    const ids = pages.flatMap((page) => page.data.map((item: any) => item.id))
    assert.lengthOf(new Set(ids), 25)
    assert.deepEqual(new Set(ids), new Set(available.map((space) => space.id)))
    assert.equal(pages[0].meta.hasNextPage, true)
    assert.equal(pages[1].meta.hasNextPage, true)
    assert.equal(pages[2].data.length, 5)
    assert.equal(pages[2].meta.hasNextPage, false)
    assert.equal(pages[3].data.length, 0)
    assert.equal(pages[3].meta.hasNextPage, false)
  })

  test('actual SQL query count stays constant as Space count grows within one availability batch', async ({
    client,
    assert,
  }) => {
    const data = await base()
    const day = DateTime.now().setZone('Asia/Riyadh').plus({ days: 2 }).startOf('day')
    const addAvailableCandidates = async (count: number) => {
      const spaces = []
      for (let index = 0; index < count; index++)
        spaces.push(await addSpace(data, { name_en: `Candidate ${count}-${index}` }))
      await db.table('space_availability_policies').multiInsert(
        spaces.map((space) => ({
          company_id: data.company.id,
          space_id: space.id,
          mode: 'full_day',
          slot_increment_minutes: 60,
          minimum_duration_minutes: 60,
          maximum_duration_minutes: 1440,
          minimum_notice_minutes: 0,
          maximum_advance_days: 365,
          preparation_buffer_minutes: 0,
          cleanup_buffer_minutes: 0,
          is_active: true,
        }))
      )
      await db.table('space_operating_hours').multiInsert(
        spaces.map((space) => ({
          company_id: data.company.id,
          space_id: space.id,
          weekday: day.weekday % 7,
          opens_at_local: '08:00',
          closes_at_local: '18:00',
          ends_next_day: false,
          sort_order: 0,
        }))
      )
    }
    const params = new URLSearchParams({
      from: day.toISO()!,
      to: day.plus({ days: 1 }).toISO()!,
      limit: '1',
    })
    await addAvailableCandidates(20)
    const small = await countSqlQueries(() => client.get(`/api/spaces?${params}`))
    small.result.assertStatus(200)
    await db.from('space_operating_hours').delete()
    await db.from('space_availability_policies').delete()
    await db.from('spaces').delete()
    await addAvailableCandidates(180)
    const large = await countSqlQueries(() => client.get(`/api/spaces?${params}`))
    large.result.assertStatus(200)
    assert.equal(small.result.body().meta.availabilityScan.batchesScanned, 1)
    assert.equal(large.result.body().meta.availabilityScan.batchesScanned, 1)
    assert.equal(small.count, 6)
    assert.equal(large.count, 6)
  })

  test('returns SPACE_DISCOVERY_WORK_LIMIT when 2000 candidates cannot resolve the page', async ({
    client,
  }) => {
    const data = await base()
    const rows = Array.from({ length: 2000 }, (_, index) => ({
      company_id: data.company.id,
      venue_id: data.venue.id,
      category_id: data.category.id,
      name_en: `Unresolvable ${index}`,
      booking_mode: 'request_to_book',
      publication_status: 'published',
      capacity_total: 20,
    }))
    for (let offset = 0; offset < rows.length; offset += 250)
      await db.table('spaces').multiInsert(rows.slice(offset, offset + 250))
    const day = DateTime.now().setZone('Asia/Riyadh').plus({ days: 2 }).startOf('day')
    const response = await client
      .get('/api/spaces')
      .qs({ from: day.toISO()!, to: day.plus({ days: 1 }).toISO()!, page: 1, limit: 10 })
    response.assertStatus(422)
    response.assertBodyContains({ error: { code: 'SPACE_DISCOVERY_WORK_LIMIT' } })
  })
})
