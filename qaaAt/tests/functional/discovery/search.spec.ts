import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import { CompanyFactory } from '#database/factories/company_factory'
import { UserFactory } from '#database/factories/user_factory'
import { seedReferenceData } from '#database/seeding/reference_data'
import { DateTime } from 'luxon'
import { responseIds, responseItems } from '#tests/support/responses'

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

test.group('Public Space search', (group) => {
  group.each.setup(withTruncateIsolation)

  test('ranks exact, prefix, substring, and description matches deterministically', async ({
    client,
    assert,
  }) => {
    const data = await base()
    const description = await addSpace(data, {
      name_en: 'Newest unrelated',
      description_en: 'Pearl venue',
      created_at: FIXED_NOW.plus({ minutes: 4 }).toSQL(),
    })
    const substring = await addSpace(data, {
      name_en: 'Grand Pearl Room',
      created_at: FIXED_NOW.plus({ minutes: 3 }).toSQL(),
    })
    const prefix = await addSpace(data, {
      name_ar: 'Pearl Ballroom',
      name_en: null,
      created_at: FIXED_NOW.plus({ minutes: 2 }).toSQL(),
    })
    const exact = await addSpace(data, { name_en: 'Pearl', created_at: FIXED_NOW.toSQL() })
    const relevance = await client.get('/api/spaces?q=pearl&sort=relevance')
    relevance.assertStatus(200)
    assert.deepEqual(responseIds(relevance.body()), [
      exact.id,
      prefix.id,
      substring.id,
      description.id,
    ])
    const newest = await client.get('/api/spaces?q=pearl&sort=newest')
    assert.deepEqual(responseIds(newest.body()), [
      description.id,
      substring.id,
      prefix.id,
      exact.id,
    ])
    const missing = await client.get('/api/spaces?sort=relevance')
    missing.assertStatus(422)
    missing.assertBodyContains({ error: { code: 'RELEVANCE_QUERY_REQUIRED' } })
  })

  test('searches Arabic and English text while treating wildcards literally', async ({
    client,
    assert,
  }) => {
    const data = await base()
    const arabic = await addSpace(data, { name_ar: 'قاعة اللؤلؤ', name_en: null })
    const english = await addSpace(data, { name_en: 'English Needle' })
    const literal = await addSpace(data, { name_en: '100%_Hall\\Name' })
    for (const [query, id] of [
      ['اللؤلؤ', arabic.id],
      ['English', english.id],
      ['%_Hall\\', literal.id],
    ] as const) {
      const response = await client.get('/api/spaces').qs({ q: query })
      response.assertStatus(200)
      assert.deepEqual(responseIds(response.body()), [id])
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
    assert.deepEqual(responseIds(response.body()), [exact.id])
    const [item] = responseItems(response.body())
    assert.isObject(item.pricing)
    if (typeof item.pricing === 'object' && item.pricing !== null) {
      assert.equal(Reflect.get(item.pricing, 'startingPriceMinor'), '9007199254740993')
    }
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
})
