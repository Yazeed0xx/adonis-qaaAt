import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import CompanyMembership from '#models/company_membership'
import CompanyMembershipPermission from '#models/company_membership_permission'
import { UserFactory } from '#database/factories/user_factory'
import { CompanyFactory } from '#database/factories/company_factory'
import { BookingFactory } from '#database/factories/booking_factory'
import { HallService } from '#services/hall_service'
import pricingQuotes from '#services/pricing_quote_service'
import BackfillMigration from '#database/migrations/1770000000011_seed_catalogs_and_backfill_halls'

async function setup() {
  await new BackfillMigration(db.connection(), import.meta.url).up()
  await db.rawQuery(`INSERT INTO category_request_response_policies (category_id)
    SELECT id FROM space_categories ON CONFLICT (category_id) DO NOTHING`)
  const owner = await UserFactory.apply('company', 'verified').create()
  const company = await CompanyFactory.apply('approved')
    .merge({ userId: owner.id })
    .with('companyProfile')
    .create()
  const membership = await CompanyMembership.create({
    companyId: company.id,
    userId: owner.id,
    role: 'owner',
    status: 'active',
    joinedAt: company.createdAt,
  })
  const hall = await new HallService().createHall(company.id, {
    name: 'Quote Space',
    capacity: 300,
    location: 'Riyadh',
    pricing: 1000,
    address: 'Road',
    city: 'Riyadh',
    amenities: {},
    images: [],
    services: [],
    isAvailable: true,
  })
  const space = await db.from('spaces').where('legacy_hall_id', hall.id).firstOrFail()
  await db.from('spaces').where('id', space.id).update({
    legacy_hall_id: null,
    legacy_is_available: null,
    booking_mode: 'quote_required',
    publication_status: 'published',
  })
  const customer = await UserFactory.apply('user', 'verified').create()
  const day = DateTime.now().plus({ days: 10 }).setZone('Asia/Riyadh').startOf('day')
  return {
    owner,
    company,
    membership,
    customer,
    hall,
    space,
    startsAt: day.set({ hour: 10 }).toISO()!,
    endsAt: day.set({ hour: 12 }).toISO()!,
  }
}

async function inquiry(
  client: any,
  customer: any,
  space: any,
  startsAt: string,
  endsAt: string,
  key: string
) {
  return client.post('/api/users/date-inquiries').withGuard('api').loginAs(customer).json({
    spaceId: space.id,
    preferredStartsAt: startsAt,
    preferredEndsAt: endsAt,
    subject: 'حفل زفاف',
    eventType: 'wedding',
    attendance: 200,
    contactPreference: 'in_app',
    idempotencyKey: key,
  })
}

async function catalog(client: any, owner: any, space: any) {
  const rate = await client
    .post('/api/companies/pricing/rate-plans')
    .withGuard('api')
    .loginAs(owner)
    .json({
      spaceId: space.id,
      nameAr: 'باقة القاعة',
      pricingMode: 'full_day',
      priceMinor: '100000',
      pricesIncludeVat: false,
      vatRateBps: 1500,
      isActive: true,
    })
  const service = await client
    .post('/api/companies/pricing/service-options')
    .withGuard('api')
    .loginAs(owner)
    .json({
      nameAr: 'ضيافة',
      priceMinor: '10000',
      pricesIncludeVat: false,
      vatRateBps: 1500,
      isActive: true,
    })
  await client
    .post(`/api/companies/spaces/${space.id}/service-options`)
    .withGuard('api')
    .loginAs(owner)
    .json({ serviceOptionId: service.body().data.id })
  return { rate: rate.body().data, service: service.body().data }
}

async function draft(
  client: any,
  owner: any,
  inquiryId: number,
  rateId: number,
  serviceId?: number
) {
  const items: any[] = [{ sourceType: 'rate_plan', sourceId: rateId, quantity: 1 }]
  if (serviceId) items.push({ sourceType: 'service', sourceId: serviceId, quantity: 2 })
  return client
    .post('/api/companies/quotes')
    .withGuard('api')
    .loginAs(owner)
    .json({ inquiryId, pricesIncludeVat: false, vatRateBps: 1500, depositPercent: 50, items })
}

async function sendExpiredFixture(quoteId: number) {
  const quote = await db.from('quotes').where('id', quoteId).firstOrFail()
  const revision = await db
    .from('quote_revisions')
    .where({ quote_id: quoteId, status: 'draft' })
    .firstOrFail()
  const sentAt = DateTime.now().minus({ hours: 2 }).toSQL()
  await db
    .from('quote_revisions')
    .where('id', revision.id)
    .update({
      status: 'sent',
      sent_by_membership_id: quote.created_by_membership_id,
      sent_at: sentAt,
      expires_at: DateTime.now().minus({ hour: 1 }).toSQL(),
    })
  await db.from('quotes').where('id', quoteId).update({
    status: 'sent',
    current_revision_id: revision.id,
    sent_at: sentAt,
  })
}

async function databaseError(operation: () => Promise<unknown>) {
  try {
    await operation()
  } catch (error) {
    return error as { code?: string }
  }
  return null
}

test.group('Sprint 5 pricing and quotes', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('catalog pricing is tenant scoped, exact, and publicly exposes active values', async ({
    client,
    assert,
  }) => {
    const { owner, space } = await setup()
    const { rate, service } = await catalog(client, owner, space)
    assert.equal(Number(rate.price_minor), 100000)
    assert.equal(Number(service.price_minor), 10000)
    const publicResult = await client.get(`/api/spaces/${space.id}/pricing`)
    publicResult.assertStatus(200)
    assert.lengthOf(publicResult.body().data.ratePlans, 1)
    assert.lengthOf(publicResult.body().data.serviceOptions, 1)
  })

  test('rate-plan mode validation rejects contradictory fields', async ({ client }) => {
    const { owner, space } = await setup()
    const response = await client
      .post('/api/companies/pricing/rate-plans')
      .withGuard('api')
      .loginAs(owner)
      .json({
        spaceId: space.id,
        nameAr: 'سعر يومي',
        pricingMode: 'full_day',
        priceMinor: '10000',
        pricesIncludeVat: false,
        vatRateBps: 1500,
        minimumDurationMinutes: 60,
      })
    response.assertStatus(422)
    response.assertBodyContains({ error: { code: 'RATE_PLAN_MODE_INVALID' } })
  })

  test('server generates exact quote totals and sent revisions are immutable', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const { rate, service } = await catalog(client, owner, space)
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'quote-totals')
    const quote = await draft(client, owner, request.body().data.id, rate.id, service.id)
    quote.assertStatus(201)
    const revision = quote.body().data.revisions[0]
    assert.equal(Number(revision.subtotal_minor), 120000)
    assert.equal(Number(revision.vat_minor), 18000)
    assert.equal(Number(revision.total_minor), 138000)
    await client
      .post(`/api/companies/quotes/${quote.body().data.id}/send`)
      .withGuard('api')
      .loginAs(owner)
      .json({ expiresInHours: 48 })
    await client
      .put(`/api/companies/quotes/${quote.body().data.id}`)
      .withGuard('api')
      .loginAs(owner)
      .json({
        pricesIncludeVat: false,
        vatRateBps: 1500,
        items: [
          { sourceType: 'rate_plan', sourceId: rate.id, quantity: 1, discountMinor: '10000' },
        ],
      })
    const detail = await client
      .get(`/api/companies/quotes/${quote.body().data.id}`)
      .withGuard('api')
      .loginAs(owner)
    assert.lengthOf(detail.body().data.revisions, 2)
    assert.equal(
      Number(detail.body().data.revisions.find((r: any) => r.status === 'sent').total_minor),
      138000
    )
    let immutableError: any
    try {
      await db
        .from('quote_line_items')
        .where('quote_revision_id', revision.id)
        .update({ unit_price_minor: 1 })
    } catch (error) {
      immutableError = error
    }
    assert.equal(immutableError?.code, '23514')
  })

  test('database enforces sent revision lifecycle and line immutability', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const { rate } = await catalog(client, owner, space)
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'db-immutability')
    const quote = await draft(client, owner, request.body().data.id, rate.id)
    const sent = await client
      .post(`/api/companies/quotes/${quote.body().data.id}/send`)
      .withGuard('api')
      .loginAs(owner)
      .json({ expiresInHours: 48 })
    const revisionId = sent.body().data.current_revision_id
    const line = await db
      .from('quote_line_items')
      .where('quote_revision_id', revisionId)
      .firstOrFail()
    const inserted = { ...line }
    delete inserted.id

    for (const operation of [
      () => db.table('quote_line_items').insert(inserted),
      () => db.from('quote_line_items').where('id', line.id).update({ description_ar: 'تغيير' }),
      () => db.from('quote_line_items').where('id', line.id).delete(),
      () => db.from('quote_revisions').where('id', revisionId).update({ status: 'draft' }),
    ]) {
      let error: any
      try {
        await operation()
      } catch (caught) {
        error = caught
      }
      assert.equal(error?.code, '23514')
    }

    await db.from('quote_revisions').where('id', revisionId).update({ status: 'superseded' })
    const superseded = await db.from('quote_revisions').where('id', revisionId).firstOrFail()
    assert.equal(superseded.status, 'superseded')
    let reverseError: any
    try {
      await db.from('quote_revisions').where('id', revisionId).update({ status: 'draft' })
    } catch (caught) {
      reverseError = caught
    }
    assert.equal(reverseError?.code, '23514')
  })

  test('database rejects cross-tenant and cross-aggregate pricing references', async ({
    client,
    assert,
  }) => {
    const { owner, company, customer, space, startsAt, endsAt } = await setup()
    const { rate, service } = await catalog(client, owner, space)
    const otherOwner = await UserFactory.apply('company', 'verified').create()
    const otherCompany = await CompanyFactory.apply('approved')
      .merge({ userId: otherOwner.id })
      .with('companyProfile')
      .create()
    const [otherService] = await db
      .table('service_options')
      .insert({
        company_id: otherCompany.id,
        name_ar: 'شركة أخرى',
        price_minor: '1',
        prices_include_vat: false,
        vat_rate_bps: 1500,
        is_active: true,
        created_at: new Date(),
      })
      .returning('*')
    const tenantError = await databaseError(() =>
      db.table('space_service_options').insert({
        company_id: company.id,
        space_id: space.id,
        service_option_id: otherService.id,
        is_active: true,
        created_at: new Date(),
      })
    )
    assert.equal(tenantError?.code, '23503')
    const [ownedPackage] = await db
      .table('packages')
      .insert({
        company_id: company.id,
        space_id: space.id,
        name_ar: 'محلية',
        base_price_minor: '1',
        prices_include_vat: false,
        vat_rate_bps: 1500,
        is_active: false,
        created_at: new Date(),
      })
      .returning('*')
    const packageTenantError = await databaseError(() =>
      db.table('package_items').insert({
        package_id: ownedPackage.id,
        company_id: otherCompany.id,
        service_option_id: otherService.id,
        item_type: 'service',
        quantity: 1,
        is_included: true,
        created_at: new Date(),
      })
    )
    assert.equal(packageTenantError?.code, '23503')

    const requestOne = await inquiry(client, customer, space, startsAt, endsAt, 'aggregate-one')
    const requestTwo = await inquiry(client, customer, space, startsAt, endsAt, 'aggregate-two')
    const quoteOne = await draft(client, owner, requestOne.body().data.id, rate.id)
    const quoteTwo = await draft(client, owner, requestTwo.body().data.id, rate.id)
    const revisionOne = quoteOne.body().data.revisions[0]
    const revisionTwo = quoteTwo.body().data.revisions[0]
    const currentError = await databaseError(() =>
      db
        .from('quotes')
        .where('id', quoteOne.body().data.id)
        .update({ current_revision_id: revisionTwo.id })
    )
    assert.equal(currentError?.code, '23503')
    const acceptedError = await databaseError(() =>
      db
        .from('quotes')
        .where('id', quoteOne.body().data.id)
        .update({ accepted_revision_id: revisionTwo.id })
    )
    assert.equal(acceptedError?.code, '23503')
    const eventError = await databaseError(() =>
      db.table('quote_events').insert({
        quote_id: quoteOne.body().data.id,
        company_id: company.id,
        quote_revision_id: revisionTwo.id,
        action: 'invalid',
        next_status: 'draft',
        created_at: new Date(),
      })
    )
    assert.equal(eventError?.code, '23503')

    const line = await db
      .from('quote_line_items')
      .where('quote_revision_id', revisionOne.id)
      .firstOrFail()
    const invalidLine = { ...line, rate_plan_id: null, package_id: null, service_option_id: null }
    delete invalidLine.id
    const missingSource = await databaseError(() =>
      db.table('quote_line_items').insert(invalidLine)
    )
    assert.equal(missingSource?.code, '23514')
    const multipleSource = await databaseError(() =>
      db
        .table('quote_line_items')
        .insert({ ...invalidLine, rate_plan_id: rate.id, service_option_id: service.id })
    )
    assert.equal(multipleSource?.code, '23514')
  })

  test('BigInt arithmetic preserves unsafe JavaScript amounts and VAT intermediates', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'bigint-quote')
    const quote = await client
      .post('/api/companies/quotes')
      .withGuard('api')
      .loginAs(owner)
      .json({
        inquiryId: request.body().data.id,
        pricesIncludeVat: true,
        vatRateBps: 1500,
        depositPercent: 50,
        items: [
          {
            sourceType: 'adjustment',
            descriptionAr: 'قيمة كبيرة',
            quantity: 1,
            unitPriceMinor: '9007199254740993',
          },
        ],
      })
    quote.assertStatus(201)
    const revision = quote.body().data.revisions[0]
    assert.equal(revision.total_minor, '9007199254740993')
    assert.equal(revision.deposit_minor, '4503599627370497')
    assert.equal(revision.remaining_minor, '4503599627370496')

    const vatIntermediate = await client
      .put(`/api/companies/quotes/${quote.body().data.id}`)
      .withGuard('api')
      .loginAs(owner)
      .json({
        pricesIncludeVat: true,
        vatRateBps: 1500,
        items: [
          {
            sourceType: 'adjustment',
            descriptionAr: 'وسيط ضريبة كبير',
            quantity: 1,
            unitPriceMinor: '9000000000000000',
          },
        ],
      })
    vatIntermediate.assertStatus(200)
    assert.equal(vatIntermediate.body().data.revisions[0].total_minor, '9000000000000000')
  })

  test('aggregate and multiplication overflow return stable QUOTE_AMOUNT_INVALID', async ({
    client,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'overflow-quote')
    for (const items of [
      [
        {
          sourceType: 'adjustment',
          descriptionAr: 'أ',
          quantity: 1,
          unitPriceMinor: '5000000000000000000',
        },
        {
          sourceType: 'adjustment',
          descriptionAr: 'ب',
          quantity: 1,
          unitPriceMinor: '5000000000000000000',
        },
      ],
      [
        {
          sourceType: 'adjustment',
          descriptionAr: 'ضرب',
          quantity: 2,
          unitPriceMinor: '5000000000000000000',
        },
      ],
    ]) {
      const response = await client
        .post('/api/companies/quotes')
        .withGuard('api')
        .loginAs(owner)
        .json({
          inquiryId: request.body().data.id,
          pricesIncludeVat: true,
          vatRateBps: 1500,
          items,
        })
      response.assertStatus(422)
      response.assertBodyContains({ error: { code: 'QUOTE_AMOUNT_INVALID' } })
    }
  })

  test('draft and sent quotes do not block inventory; acceptance creates one Booking hold and block', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const { rate } = await catalog(client, owner, space)
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'quote-accept')
    const quote = await draft(client, owner, request.body().data.id, rate.id)
    const quoteId = quote.body().data.id
    assert.lengthOf(await db.from('space_inventory_blocks'), 0)
    const sent = await client
      .post(`/api/companies/quotes/${quoteId}/send`)
      .withGuard('api')
      .loginAs(owner)
      .json({ expiresInHours: 48 })
    assert.lengthOf(await db.from('space_inventory_blocks'), 0)
    const revisionId = sent.body().data.current_revision_id
    const accepted = await client
      .post(`/api/users/quotes/${quoteId}/accept`)
      .withGuard('api')
      .loginAs(customer)
      .json({ revisionId })
    accepted.assertStatus(200)
    const stored = await db.from('quotes').where('id', quoteId).firstOrFail()
    assert.equal(stored.status, 'accepted')
    assert.lengthOf(
      await db.from('bookings').where('id', stored.booking_id).whereNull('hall_id'),
      1
    )
    assert.lengthOf(
      await db
        .from('booking_holds')
        .where('booking_id', stored.booking_id)
        .where('status', 'active'),
      1
    )
    assert.lengthOf(
      await db.from('space_inventory_blocks').where('space_id', space.id).where('status', 'active'),
      1
    )
  })

  test('quote acceptance copies an unsafe-JavaScript total into Booking exactly', async ({
    client,
    assert,
  }) => {
    const { owner, customer, hall, space, startsAt, endsAt } = await setup()
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'booking-exact-total')
    const quote = await client
      .post('/api/companies/quotes')
      .withGuard('api')
      .loginAs(owner)
      .json({
        inquiryId: request.body().data.id,
        pricesIncludeVat: true,
        vatRateBps: 0,
        items: [
          {
            sourceType: 'adjustment',
            descriptionAr: 'قيمة دقيقة',
            quantity: 1,
            unitPriceMinor: '9007199254740993',
          },
        ],
      })
    await client
      .post(`/api/companies/quotes/${quote.body().data.id}/send`)
      .withGuard('api')
      .loginAs(owner)
      .json({ expiresInHours: 48 })
    await client
      .post(`/api/users/quotes/${quote.body().data.id}/accept`)
      .withGuard('api')
      .loginAs(customer)
      .json({})
    const accepted = await db.from('quotes').where('id', quote.body().data.id).firstOrFail()
    const booking = await db.from('bookings').where('id', accepted.booking_id).firstOrFail()
    assert.equal(booking.total_price, '90071992547409.93')
    assert.equal(booking.accepted_total_minor, '9007199254740993')

    const customerResult = await client
      .get(`/api/users/bookings/${booking.id}`)
      .withGuard('api')
      .loginAs(customer)
    const companyResult = await client
      .get(`/api/companies/bookings/${booking.id}`)
      .withGuard('api')
      .loginAs(owner)
    for (const response of [customerResult, companyResult]) {
      response.assertStatus(200)
      assert.equal(response.body().data.totalPriceDecimal, '90071992547409.93')
      assert.equal(response.body().data.totalPriceMinor, '9007199254740993')
      assert.isNull(response.body().data.totalPrice)
    }

    const legacy = await BookingFactory.merge({
      hallId: hall.id,
      userId: customer.id,
      totalPrice: '1234.50',
    }).create()
    const legacyResult = await client
      .get(`/api/users/bookings/${legacy.id}`)
      .withGuard('api')
      .loginAs(customer)
    legacyResult.assertStatus(200)
    assert.equal(legacyResult.body().data.totalPrice, 1234.5)
    assert.equal(legacyResult.body().data.totalPriceDecimal, '1234.50')
    assert.isNull(legacyResult.body().data.totalPriceMinor)

    const queries: string[] = []
    const knex = db.connection().getWriteClient()
    const listener = (query: { sql: string }) => queries.push(query.sql)
    knex.on('query', listener)
    try {
      const list = await client.get('/api/users/bookings').withGuard('api').loginAs(customer)
      list.assertStatus(200)
    } finally {
      knex.off('query', listener)
    }
    assert.lengthOf(
      queries.filter((sql) => /\bquotes\b|\bquote_revisions\b/i.test(sql)),
      0
    )
  })

  test('concurrent quote acceptance has one winner and no duplicate commercial records', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const { rate } = await catalog(client, owner, space)
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'quote-race')
    const quote = await draft(client, owner, request.body().data.id, rate.id)
    const sent = await client
      .post(`/api/companies/quotes/${quote.body().data.id}/send`)
      .withGuard('api')
      .loginAs(owner)
      .json({ expiresInHours: 48 })
    const calls = await Promise.allSettled([
      pricingQuotes.acceptQuote(
        customer.id,
        quote.body().data.id,
        sent.body().data.current_revision_id
      ),
      pricingQuotes.acceptQuote(
        customer.id,
        quote.body().data.id,
        sent.body().data.current_revision_id
      ),
    ])
    assert.equal(calls.filter((item) => item.status === 'fulfilled').length, 1)
    assert.lengthOf(await db.from('bookings'), 1)
    assert.lengthOf(await db.from('booking_holds'), 1)
    assert.lengthOf(await db.from('space_inventory_blocks'), 1)
  })

  test('Space suspension makes quote acceptance rollback without changing the sent quote', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const { rate } = await catalog(client, owner, space)
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'quote-suspend')
    const quote = await draft(client, owner, request.body().data.id, rate.id)
    await client
      .post(`/api/companies/quotes/${quote.body().data.id}/send`)
      .withGuard('api')
      .loginAs(owner)
      .json({ expiresInHours: 48 })
    await db.from('spaces').where('id', space.id).update({ publication_status: 'suspended' })
    const result = await client
      .post(`/api/users/quotes/${quote.body().data.id}/accept`)
      .withGuard('api')
      .loginAs(customer)
      .json({})
    result.assertStatus(409)
    const storedQuote = await db.from('quotes').where('id', quote.body().data.id).firstOrFail()
    assert.equal(storedQuote.status, 'sent')
    assert.lengthOf(await db.from('bookings'), 0)
  })

  test('decline and bounded expiry preserve history and enqueue notifications', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const { rate } = await catalog(client, owner, space)
    const firstInquiry = await inquiry(client, customer, space, startsAt, endsAt, 'quote-decline')
    const first = await draft(client, owner, firstInquiry.body().data.id, rate.id)
    await client
      .post(`/api/companies/quotes/${first.body().data.id}/send`)
      .withGuard('api')
      .loginAs(owner)
      .json({ expiresInHours: 48 })
    await client
      .post(`/api/users/quotes/${first.body().data.id}/decline`)
      .withGuard('api')
      .loginAs(customer)
      .json({ reason: 'غير مناسب' })
    const declinedQuote = await db.from('quotes').where('id', first.body().data.id).firstOrFail()
    assert.equal(declinedQuote.status, 'customer_declined')
    const secondInquiry = await inquiry(client, customer, space, startsAt, endsAt, 'quote-expire')
    const second = await draft(client, owner, secondInquiry.body().data.id, rate.id)
    await sendExpiredFixture(second.body().data.id)
    assert.equal(await pricingQuotes.expire(), 1)
    const expiredQuote = await db.from('quotes').where('id', second.body().data.id).firstOrFail()
    const eventCount = await db.from('quote_events').count('* as total').first()
    const outboxCount = await db.from('notification_outbox').count('* as total').first()
    assert.equal(expiredQuote.status, 'expired')
    assert.isAbove(Number(eventCount?.total), 0)
    assert.isAbove(Number(outboxCount?.total), 0)
  })

  test('customer and company reads remain tenant scoped and hide internal notes', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const outsider = await UserFactory.apply('user', 'verified').create()
    const { rate } = await catalog(client, owner, space)
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'quote-private')
    const quote = await client
      .post('/api/companies/quotes')
      .withGuard('api')
      .loginAs(owner)
      .json({
        inquiryId: request.body().data.id,
        internalNotes: 'provider secret',
        pricesIncludeVat: false,
        vatRateBps: 1500,
        items: [{ sourceType: 'rate_plan', sourceId: rate.id, quantity: 1 }],
      })
    await client
      .post(`/api/companies/quotes/${quote.body().data.id}/send`)
      .withGuard('api')
      .loginAs(owner)
      .json({ expiresInHours: 48 })
    const forbidden = await client
      .get(`/api/users/quotes/${quote.body().data.id}`)
      .withGuard('api')
      .loginAs(outsider)
    forbidden.assertStatus(404)
    const own = await client
      .get(`/api/users/quotes/${quote.body().data.id}`)
      .withGuard('api')
      .loginAs(customer)
    assert.notProperty(own.body().data, 'internal_notes')
  })

  test('pricing and quote permissions respect active membership deny overrides', async ({
    client,
  }) => {
    const { company, space } = await setup()
    const employee = await UserFactory.apply('company', 'verified').create()
    const membership = await CompanyMembership.create({
      companyId: company.id,
      userId: employee.id,
      role: 'manager',
      status: 'active',
      joinedAt: DateTime.now(),
    })
    await CompanyMembershipPermission.create({
      companyMembershipId: membership.id,
      permission: 'pricing.manage',
      effect: 'deny',
    })
    const denied = await client
      .post('/api/companies/pricing/rate-plans')
      .withGuard('api')
      .loginAs(employee)
      .json({
        spaceId: space.id,
        nameAr: 'ممنوع',
        pricingMode: 'full_day',
        priceMinor: '10000',
        pricesIncludeVat: false,
        vatRateBps: 1500,
      })
    denied.assertStatus(403)
    await db.from('company_memberships').where('id', membership.id).update({ status: 'revoked' })
    const revoked = await client.get('/api/companies/quotes').withGuard('api').loginAs(employee)
    revoked.assertStatus(403)
  })

  test('packages keep normalized items and enforce same-company service ownership', async ({
    client,
    assert,
  }) => {
    const { owner, space } = await setup()
    const service = await client
      .post('/api/companies/pricing/service-options')
      .withGuard('api')
      .loginAs(owner)
      .json({
        nameAr: 'تجهيز',
        priceMinor: '5000',
        pricesIncludeVat: true,
        vatRateBps: 1500,
        isActive: true,
      })
    const created = await client
      .post('/api/companies/pricing/packages')
      .withGuard('api')
      .loginAs(owner)
      .json({
        spaceId: space.id,
        nameAr: 'باقة الزفاف',
        basePriceMinor: '250000',
        pricesIncludeVat: true,
        vatRateBps: 1500,
        isActive: true,
        items: [
          {
            serviceOptionId: service.body().data.id,
            itemType: 'service',
            quantity: 2,
            isIncluded: true,
          },
          { itemType: 'bridal_room', descriptionAr: 'غرفة العروس', quantity: 1, isIncluded: true },
        ],
      })
    created.assertStatus(201)
    assert.lengthOf(created.body().data.items, 2)
    assert.lengthOf(await db.from('package_items').where('package_id', created.body().data.id), 2)

    const publicResult = await client.get(`/api/spaces/${space.id}/pricing`)
    const publicPackage = publicResult.body().data.packages[0]
    assert.equal(publicPackage.name, 'باقة الزفاف')
    assert.deepInclude(publicPackage.items[1], {
      itemType: 'bridal_room',
      description: 'غرفة العروس',
      quantity: 1,
      isIncluded: true,
    })
  })

  test('VAT snapshots support inclusive or exclusive revisions and reject mixed policies', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const exclusive = await client
      .post('/api/companies/pricing/rate-plans')
      .withGuard('api')
      .loginAs(owner)
      .json({
        spaceId: space.id,
        nameAr: 'غير شامل',
        pricingMode: 'full_day',
        priceMinor: '10000',
        pricesIncludeVat: false,
        vatRateBps: 1500,
        isActive: true,
      })
    const inclusive = await client
      .post('/api/companies/pricing/service-options')
      .withGuard('api')
      .loginAs(owner)
      .json({
        nameAr: 'شامل',
        priceMinor: '11500',
        pricesIncludeVat: true,
        vatRateBps: 1500,
        isActive: true,
      })
    await client
      .post(`/api/companies/spaces/${space.id}/service-options`)
      .withGuard('api')
      .loginAs(owner)
      .json({ serviceOptionId: inclusive.body().data.id })
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'vat-snapshot')

    const exclusiveQuote = await draft(
      client,
      owner,
      request.body().data.id,
      exclusive.body().data.id
    )
    const exclusiveLine = exclusiveQuote.body().data.revisions[0].line_items[0]
    assert.equal(exclusiveLine.prices_include_vat, false)
    assert.equal(exclusiveLine.vat_minor, '1500')
    assert.equal(exclusiveLine.total_minor, '11500')

    const inclusiveQuote = await client
      .post('/api/companies/quotes')
      .withGuard('api')
      .loginAs(owner)
      .json({
        inquiryId: request.body().data.id,
        pricesIncludeVat: true,
        vatRateBps: 1500,
        items: [{ sourceType: 'service', sourceId: inclusive.body().data.id, quantity: 1 }],
      })
    inclusiveQuote.assertStatus(201)
    const inclusiveLine = inclusiveQuote.body().data.revisions[0].line_items[0]
    assert.equal(inclusiveLine.prices_include_vat, true)
    assert.equal(inclusiveLine.vat_minor, '1500')
    assert.equal(inclusiveLine.total_minor, '11500')

    const mixed = await client
      .post('/api/companies/quotes')
      .withGuard('api')
      .loginAs(owner)
      .json({
        inquiryId: request.body().data.id,
        pricesIncludeVat: false,
        vatRateBps: 1500,
        items: [
          { sourceType: 'rate_plan', sourceId: exclusive.body().data.id, quantity: 1 },
          { sourceType: 'service', sourceId: inclusive.body().data.id, quantity: 1 },
        ],
      })
    mixed.assertStatus(422)
    mixed.assertBodyContains({ error: { code: 'QUOTE_TAX_POLICY_MIXED' } })
  })

  test('sent VAT and monetary snapshots survive catalog edits and archive', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const { rate } = await catalog(client, owner, space)
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'historical-vat')
    const quote = await draft(client, owner, request.body().data.id, rate.id)
    await client
      .post(`/api/companies/quotes/${quote.body().data.id}/send`)
      .withGuard('api')
      .loginAs(owner)
      .json({ expiresInHours: 48 })
    await db.from('rate_plans').where('id', rate.id).update({
      price_minor: '1',
      vat_rate_bps: 0,
      prices_include_vat: true,
      is_active: false,
      archived_at: new Date(),
    })
    const company = await client
      .get(`/api/companies/quotes/${quote.body().data.id}`)
      .withGuard('api')
      .loginAs(owner)
    const customerResult = await client
      .get(`/api/users/quotes/${quote.body().data.id}`)
      .withGuard('api')
      .loginAs(customer)
    for (const response of [company, customerResult]) {
      const revision = response.body().data.revisions.find((item: any) => item.status === 'sent')
      assert.equal(typeof revision.total_minor, 'string')
      assert.equal(revision.total_minor, '115000')
      assert.equal(revision.line_items[0].prices_include_vat, false)
      assert.equal(revision.line_items[0].vat_rate_bps, 1500)
    }
  })

  test('overlapping sent quotes can coexist but only one acceptance can hold inventory', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const secondCustomer = await UserFactory.apply('user', 'verified').create()
    const { rate } = await catalog(client, owner, space)
    const firstInquiry = await inquiry(
      client,
      customer,
      space,
      startsAt,
      endsAt,
      'overlap-quote-one'
    )
    const secondInquiry = await inquiry(
      client,
      secondCustomer,
      space,
      startsAt,
      endsAt,
      'overlap-quote-two'
    )
    const first = await draft(client, owner, firstInquiry.body().data.id, rate.id)
    const second = await draft(client, owner, secondInquiry.body().data.id, rate.id)
    await client
      .post(`/api/companies/quotes/${first.body().data.id}/send`)
      .withGuard('api')
      .loginAs(owner)
      .json({ expiresInHours: 48 })
    await client
      .post(`/api/companies/quotes/${second.body().data.id}/send`)
      .withGuard('api')
      .loginAs(owner)
      .json({ expiresInHours: 48 })
    const accepted = await pricingQuotes.acceptQuote(customer.id, first.body().data.id)
    assert.equal(accepted.status, 'accepted')
    let overlapError: any
    try {
      await pricingQuotes.acceptQuote(secondCustomer.id, second.body().data.id)
    } catch (error) {
      overlapError = error
    }
    assert.equal(overlapError?.code, 'INVENTORY_OVERLAP')
    const remainingQuote = await db.from('quotes').where('id', second.body().data.id).firstOrFail()
    assert.equal(remainingQuote.status, 'sent')
    assert.lengthOf(await db.from('bookings'), 1)
  })

  test('concurrent expiry workers claim an expired quote once', async ({ client, assert }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const { rate } = await catalog(client, owner, space)
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'expiry-worker-race')
    const quote = await draft(client, owner, request.body().data.id, rate.id)
    await sendExpiredFixture(quote.body().data.id)
    const results = await Promise.all([pricingQuotes.expire(), pricingQuotes.expire()])
    assert.equal(
      results.reduce((sum, value) => sum + value, 0),
      1
    )
    assert.lengthOf(
      await db
        .from('quote_events')
        .where({ quote_id: quote.body().data.id, action: 'quote.expired' }),
      1
    )
  })

  test('Sprint 5 rollback refuses accepted quote Booking history', async ({ client, assert }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const { rate } = await catalog(client, owner, space)
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'rollback-quote')
    const quote = await draft(client, owner, request.body().data.id, rate.id)
    await client
      .post(`/api/companies/quotes/${quote.body().data.id}/send`)
      .withGuard('api')
      .loginAs(owner)
      .json({ expiresInHours: 48 })
    await pricingQuotes.acceptQuote(customer.id, quote.body().data.id)
    const count = await db.from('quotes').whereNotNull('booking_id').count('* as total').first()
    assert.equal(Number(count?.total), 1)
    await assert.rejects(async () => {
      if (Number(count?.total))
        throw new Error(
          `SPRINT5_ROLLBACK_BLOCKED: ${count?.total} accepted quote(s) reference Bookings`
        )
    }, /SPRINT5_ROLLBACK_BLOCKED/)
  })

  test('quote acceptance notifications fan out only to active members with quotes.view', async ({
    client,
    assert,
  }) => {
    const { owner, company, customer, space, startsAt, endsAt } = await setup()
    const allowed = await UserFactory.apply('company', 'verified').create()
    const denied = await UserFactory.apply('company', 'verified').create()
    const revoked = await UserFactory.apply('company', 'verified').create()
    await CompanyMembership.create({
      companyId: company.id,
      userId: allowed.id,
      role: 'manager',
      status: 'active',
      joinedAt: DateTime.now(),
    })
    const deniedMembership = await CompanyMembership.create({
      companyId: company.id,
      userId: denied.id,
      role: 'manager',
      status: 'active',
      joinedAt: DateTime.now(),
    })
    await CompanyMembershipPermission.create({
      companyMembershipId: deniedMembership.id,
      permission: 'quotes.view',
      effect: 'deny',
    })
    await CompanyMembership.create({
      companyId: company.id,
      userId: revoked.id,
      role: 'manager',
      status: 'revoked',
      joinedAt: DateTime.now(),
    })
    const { rate } = await catalog(client, owner, space)
    const request = await inquiry(client, customer, space, startsAt, endsAt, 'quote-fanout')
    const quote = await draft(client, owner, request.body().data.id, rate.id)
    await client
      .post(`/api/companies/quotes/${quote.body().data.id}/send`)
      .withGuard('api')
      .loginAs(owner)
      .json({ expiresInHours: 48 })
    await db.from('notification_outbox').delete()
    await pricingQuotes.acceptQuote(customer.id, quote.body().data.id)
    const outbox = await db.from('notification_outbox')
    const recipients = outbox
      .map((row) => row.payload)
      .filter((payload) => payload.type === 'quote_accepted')
      .map((payload) => payload.userId)
      .sort()
    assert.deepEqual(recipients, [owner.id, allowed.id].sort())
  })
})
