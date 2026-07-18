import db from '@adonisjs/lucid/services/db'
import SpaceException from '#exceptions/space_exception'
import availability from '#services/availability_service'

type Input = {
  q?: string
  category?: string
  city?: string
  capacity?: number
  amenities?: string
  bookingMode?: string
  pricingMode?: string
  minimumPriceMinor?: string
  maximumPriceMinor?: string
  from?: string
  to?: string
  sessionCode?: string
  sort?: string
  page?: number
  limit?: number
}

const localized = (ar: string | null, en: string | null) => ar ?? en

export class SpaceDiscoveryService {
  async list(input: Input) {
    const maximumMoney = 9_223_372_036_854_775_807n
    const minimumPrice =
      input.minimumPriceMinor === undefined ? undefined : BigInt(input.minimumPriceMinor)
    const maximumPrice =
      input.maximumPriceMinor === undefined ? undefined : BigInt(input.maximumPriceMinor)
    if (
      (minimumPrice !== undefined && minimumPrice > maximumMoney) ||
      (maximumPrice !== undefined && maximumPrice > maximumMoney)
    )
      throw new SpaceException(
        'Price filter exceeds the signed 64-bit minor-unit bound',
        'PRICE_FILTER_OUT_OF_RANGE',
        422
      )
    if ((input.from && !input.to) || (!input.from && input.to))
      throw new SpaceException(
        'from and to must be supplied together',
        'AVAILABILITY_RANGE_INVALID',
        422
      )
    if (minimumPrice !== undefined && maximumPrice !== undefined && minimumPrice > maximumPrice)
      throw new SpaceException(
        'minimumPriceMinor cannot exceed maximumPriceMinor',
        'PRICE_RANGE_INVALID',
        422
      )
    const page = input.page ?? 1
    const limit = input.limit ?? 20
    const amenitySlugs = [
      ...new Set(
        (input.amenities ?? '')
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      ),
    ]
    const [category, amenities] = await Promise.all([
      input.category
        ? db.from('space_categories').where('slug', input.category).where('is_active', true).first()
        : null,
      amenitySlugs.length
        ? db
            .from('amenity_definitions')
            .whereIn('slug', amenitySlugs)
            .where('is_active', true)
            .select('slug')
        : [],
    ])
    if (input.category && !category)
      throw new SpaceException('Unknown category slug', 'SPACE_CATEGORY_INVALID', 422)
    if (amenities.length !== amenitySlugs.length)
      throw new SpaceException('Unknown amenity slug', 'SPACE_AMENITY_INVALID', 422)

    const query = db
      .from('spaces as s')
      .join('venues as v', 'v.id', 's.venue_id')
      .join('companies as c', 'c.id', 's.company_id')
      .join('space_categories as sc', 'sc.id', 's.category_id')
      .where('s.publication_status', 'published')
      .whereNull('s.deleted_at')
      .where('c.status', 'approved')
      .whereNull('c.deleted_at')
      .whereNull('v.deleted_at')
      .where('sc.is_active', true)
    if (category) query.where('s.category_id', category.id)
    if (input.city) query.whereRaw('LOWER(v.city) = LOWER(?)', [input.city])
    if (input.capacity) query.where('s.capacity_total', '>=', input.capacity)
    if (input.bookingMode) query.where('s.booking_mode', input.bookingMode)
    if (input.pricingMode)
      query.whereExists((q) =>
        q
          .from('rate_plans as pf')
          .whereRaw('pf.space_id = s.id')
          .where('pf.is_active', true)
          .whereNull('pf.archived_at')
          .where('pf.pricing_mode', input.pricingMode!)
      )
    if (input.sessionCode)
      query.whereExists((q) =>
        q
          .from('space_availability_sessions as ss')
          .whereRaw('ss.space_id = s.id')
          .where('ss.is_active', true)
          .where('ss.code', input.sessionCode!)
      )
    if (minimumPrice !== undefined)
      query.whereRaw(
        `(SELECT MIN(rp.price_minor) FROM rate_plans rp WHERE rp.space_id=s.id AND rp.is_active AND rp.archived_at IS NULL AND rp.pricing_mode <> 'custom_quote') >= ?`,
        [minimumPrice.toString()]
      )
    if (maximumPrice !== undefined)
      query.whereRaw(
        `(SELECT MIN(rp.price_minor) FROM rate_plans rp WHERE rp.space_id=s.id AND rp.is_active AND rp.archived_at IS NULL AND rp.pricing_mode <> 'custom_quote') <= ?`,
        [maximumPrice.toString()]
      )
    for (const slug of amenitySlugs)
      query.whereExists((q) =>
        q
          .from('space_amenities as sa')
          .join('amenity_definitions as ad', 'ad.id', 'sa.amenity_definition_id')
          .whereRaw('sa.space_id = s.id')
          .where('ad.slug', slug)
          .where('ad.is_active', true)
      )
    let escapedSearch: string | undefined
    if (input.q) {
      escapedSearch = input.q.toLocaleLowerCase().replace(/[\\%_]/g, '\\$&')
      query.where((q) =>
        q
          .whereRaw(`LOWER(COALESCE(s.name_ar, '')) LIKE ? ESCAPE '\\'`, [`%${escapedSearch}%`])
          .orWhereRaw(`LOWER(COALESCE(s.name_en, '')) LIKE ? ESCAPE '\\'`, [`%${escapedSearch}%`])
          .orWhereRaw(`LOWER(COALESCE(s.description_ar, '')) LIKE ? ESCAPE '\\'`, [
            `%${escapedSearch}%`,
          ])
          .orWhereRaw(`LOWER(COALESCE(s.description_en, '')) LIKE ? ESCAPE '\\'`, [
            `%${escapedSearch}%`,
          ])
      )
    }
    query.select(
      's.id',
      's.venue_id',
      's.name_ar',
      's.name_en',
      's.description_ar',
      's.description_en',
      's.booking_mode',
      's.capacity_total',
      's.created_at',
      'v.name_ar as venue_name_ar',
      'v.name_en as venue_name_en',
      'v.city',
      'v.district',
      'v.timezone',
      'sc.slug as category_slug',
      'sc.name_ar as category_name_ar',
      'sc.name_en as category_name_en'
    )
    query.select(
      db.raw(
        `(SELECT MIN(rp.price_minor) FROM rate_plans rp WHERE rp.space_id=s.id AND rp.is_active AND rp.archived_at IS NULL AND rp.pricing_mode <> 'custom_quote') AS starting_price_minor`
      )
    )
    query.select(
      db.raw(
        `(SELECT array_agg(DISTINCT rp.pricing_mode ORDER BY rp.pricing_mode) FROM rate_plans rp WHERE rp.space_id=s.id AND rp.is_active AND rp.archived_at IS NULL) AS pricing_modes`
      )
    )
    query.select(
      db.raw(
        `(SELECT CASE WHEN COUNT(DISTINCT rp.prices_include_vat)=1 THEN bool_and(rp.prices_include_vat) ELSE NULL END FROM rate_plans rp WHERE rp.space_id=s.id AND rp.is_active AND rp.archived_at IS NULL) AS prices_include_vat`
      )
    )
    query.select(
      db.raw(
        `COALESCE((SELECT array_agg(ad.slug ORDER BY ad.slug) FROM space_amenities sa JOIN amenity_definitions ad ON ad.id=sa.amenity_definition_id WHERE sa.space_id=s.id AND ad.is_active), ARRAY[]::varchar[]) AS amenity_slugs`
      )
    )
    query.select(
      db.raw(
        `(SELECT json_build_object('id', sm.id, 'type', sm.media_type, 'contentUrl', '/api/space-media/' || sm.id || '/content', 'altTextAr', sm.alt_text_ar, 'altTextEn', sm.alt_text_en) FROM space_media sm WHERE sm.space_id=s.id AND sm.moderation_status='approved' AND sm.deleted_at IS NULL ORDER BY sm.is_cover DESC, sm.sort_order, sm.id LIMIT 1) AS cover_media`
      )
    )
    const sort = input.sort ?? (input.q ? 'relevance' : 'newest')
    if (sort === 'relevance' && !input.q)
      throw new SpaceException('sort=relevance requires q', 'RELEVANCE_QUERY_REQUIRED', 422)
    if (sort === 'relevance') {
      const exact = input.q!.toLocaleLowerCase()
      const names = [`s.name_ar`, `s.name_en`]
      const descriptions = [`s.description_ar`, `s.description_en`]
      const bindings = [
        ...names.map(() => exact),
        ...names.map(() => `${escapedSearch}%`),
        ...names.map(() => `%${escapedSearch}%`),
        ...descriptions.map(() => `%${escapedSearch}%`),
      ]
      query.orderByRaw(
        `CASE WHEN ${names.map((field) => `LOWER(COALESCE(${field}, '')) = ?`).join(' OR ')} THEN 1 WHEN ${names.map((field) => `LOWER(COALESCE(${field}, '')) LIKE ? ESCAPE '\\'`).join(' OR ')} THEN 2 WHEN ${names.map((field) => `LOWER(COALESCE(${field}, '')) LIKE ? ESCAPE '\\'`).join(' OR ')} THEN 3 WHEN ${descriptions.map((field) => `LOWER(COALESCE(${field}, '')) LIKE ? ESCAPE '\\'`).join(' OR ')} THEN 4 ELSE 5 END ASC`,
        bindings
      )
      query.orderBy('s.created_at', 'desc')
    } else if (sort === 'capacity') query.orderBy('s.capacity_total', 'desc')
    else if (sort === 'price_asc')
      query.orderByRaw(
        `(SELECT MIN(rp.price_minor) FROM rate_plans rp WHERE rp.space_id=s.id AND rp.is_active AND rp.archived_at IS NULL AND rp.pricing_mode <> 'custom_quote') ASC NULLS LAST`
      )
    else if (sort === 'price_desc')
      query.orderByRaw(
        `(SELECT MIN(rp.price_minor) FROM rate_plans rp WHERE rp.space_id=s.id AND rp.is_active AND rp.archived_at IS NULL AND rp.pricing_mode <> 'custom_quote') DESC NULLS LAST`
      )
    else query.orderBy('s.created_at', 'desc')
    query.orderBy('s.id', 'desc')
    const batchSize = 200
    const maximumBatches = 10
    let scannedCandidates = 0
    let batchesScanned = 0
    let exhausted = false
    let visible: any[] = []
    let availabilityById = new Map<number, any>()
    if (input.from && input.to) {
      const needed = page * limit + 1
      while (visible.length < needed && batchesScanned < maximumBatches) {
        const batch = await query.clone().limit(batchSize).offset(scannedCandidates)
        batchesScanned++
        scannedCandidates += batch.length
        if (!batch.length) {
          exhausted = true
          break
        }
        const batchAvailability = await availability.publicAvailabilityBatch(
          batch,
          input.from,
          input.to,
          input.sessionCode
        )
        for (const [id, value] of batchAvailability) availabilityById.set(id, value)
        visible.push(
          ...batch.filter((row) =>
            batchAvailability.get(row.id)?.slots.some((slot: any) => slot.isAvailable)
          )
        )
        if (batch.length < batchSize) {
          exhausted = true
          break
        }
      }
      if (!exhausted && visible.length < needed)
        throw new SpaceException(
          'Availability discovery work limit reached before this page could be resolved',
          'SPACE_DISCOVERY_WORK_LIMIT',
          422
        )
    } else {
      visible = await query.limit(limit + 1).offset((page - 1) * limit)
      exhausted = visible.length <= limit
    }
    const start = input.from ? (page - 1) * limit : 0
    const paged = visible.slice(start, start + limit)
    const hasNextPage = visible.length > start + limit
    return {
      data: paged.map((r) => ({
        id: r.id,
        venueId: r.venue_id,
        name: localized(r.name_ar, r.name_en),
        description: localized(r.description_ar, r.description_en),
        venueName: localized(r.venue_name_ar, r.venue_name_en),
        category: {
          slug: r.category_slug,
          label: localized(r.category_name_ar, r.category_name_en),
        },
        bookingMode: r.booking_mode,
        location: {
          city: r.city,
          district: r.district,
          display: r.district ? `${r.city}, ${r.district}` : r.city,
        },
        capacity: { maximumAttendance: r.capacity_total },
        amenities: r.amenity_slugs,
        coverMedia: r.cover_media,
        pricing: {
          startingPriceMinor:
            r.starting_price_minor === null ? null : String(r.starting_price_minor),
          currency: 'SAR',
          supportedModes: r.pricing_modes ?? [],
          pricesIncludeVat: r.prices_include_vat,
        },
        availability: input.from ? availabilityById.get(r.id) : undefined,
      })),
      meta: {
        page,
        limit,
        hasNextPage,
        availabilityScan: input.from
          ? {
              batchSize,
              maximumBatches,
              batchesScanned,
              scannedCandidates,
              exhausted,
            }
          : undefined,
      },
    }
  }
}
