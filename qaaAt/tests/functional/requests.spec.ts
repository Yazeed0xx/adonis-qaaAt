import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import CompanyMembership from '#models/company_membership'
import CompanyMembershipPermission from '#models/company_membership_permission'
import { UserFactory } from '#database/factories/user_factory'
import { CompanyFactory } from '#database/factories/company_factory'
import { HallService } from '#services/hall_service'
import requestWorkflow from '#services/request_workflow_service'
import { assertSprint4RollbackSafe } from '#lib/sprint4_migration_preflight'
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
  await CompanyMembership.create({
    companyId: company.id,
    userId: owner.id,
    role: 'owner',
    status: 'active',
    joinedAt: company.createdAt,
  })
  const hall = await new HallService().createHall(company.id, {
    name: 'Sprint 4 Space',
    capacity: 200,
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
    booking_mode: 'request_to_book',
    publication_status: 'published',
  })
  const customer = await UserFactory.apply('user', 'verified').create()
  const day = DateTime.now().plus({ days: 10 }).setZone('Asia/Riyadh').startOf('day')
  const startsAt = day.set({ hour: 10 }).toISO()!
  const endsAt = day.set({ hour: 12 }).toISO()!
  return { owner, company, customer, space, day, startsAt, endsAt }
}

test.group('Sprint 4 requests, inquiries, and visits', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('Space-only request is idempotent, pending, and non-blocking', async ({
    client,
    assert,
  }) => {
    const { customer, space, startsAt, endsAt } = await setup()
    const payload = {
      spaceId: space.id,
      startsAt,
      endsAt,
      eventType: 'wedding',
      attendance: 100,
      contactPreference: 'in_app',
      idempotencyKey: 'booking-request-001',
    }
    const first = await client
      .post('/api/users/booking-requests')
      .withGuard('api')
      .loginAs(customer)
      .json(payload)
    first.assertStatus(201)
    const replay = await client
      .post('/api/users/booking-requests')
      .withGuard('api')
      .loginAs(customer)
      .json(payload)
    replay.assertStatus(201)
    assert.equal(first.body().data.id, replay.body().data.id)
    const booking = await db.from('bookings').where('id', first.body().data.id).firstOrFail()
    assert.equal(booking.hall_id, null)
    assert.equal(booking.space_id, space.id)
    assert.equal(booking.status, 'pending')
    assert.equal(
      await db
        .from('space_inventory_blocks')
        .count('* as total')
        .first()
        .then((row) => Number(row?.total)),
      0
    )
  })

  test('provider approval revalidates and atomically creates the existing hold and block', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const created = await client
      .post('/api/users/booking-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({
        spaceId: space.id,
        startsAt,
        endsAt,
        eventType: 'wedding',
        attendance: 100,
        contactPreference: 'in_app',
        idempotencyKey: 'booking-request-002',
      })
    created.assertStatus(201)
    const approved = await client
      .post(`/api/companies/booking-requests/${created.body().data.id}/approve`)
      .withGuard('api')
      .loginAs(owner)
    approved.assertStatus(200)
    const approvedBooking = await db
      .from('bookings')
      .where('id', created.body().data.id)
      .firstOrFail()
    assert.equal(approvedBooking.status, 'accepted')
    assert.lengthOf(await db.from('booking_holds').where('booking_id', created.body().data.id), 1)
    assert.lengthOf(await db.from('space_inventory_blocks').where('space_id', space.id), 1)
  })

  test('availability changes before approval return conflict and leave request pending', async ({
    client,
    assert,
  }) => {
    const { owner, company, customer, space, day, startsAt, endsAt } = await setup()
    const created = await client
      .post('/api/users/booking-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({
        spaceId: space.id,
        startsAt,
        endsAt,
        eventType: 'wedding',
        attendance: 100,
        contactPreference: 'in_app',
        idempotencyKey: 'booking-request-003',
      })
    await db.table('availability_exceptions').insert({
      company_id: company.id,
      space_id: space.id,
      local_date: day.toISODate(),
      kind: 'closed',
      ends_next_day: false,
      created_by_user_id: owner.id,
      created_at: new Date(),
    })
    const approved = await client
      .post(`/api/companies/booking-requests/${created.body().data.id}/approve`)
      .withGuard('api')
      .loginAs(owner)
    approved.assertStatus(409)
    const pendingBooking = await db
      .from('bookings')
      .where('id', created.body().data.id)
      .firstOrFail()
    assert.equal(pendingBooking.status, 'pending')
    assert.lengthOf(await db.from('booking_holds'), 0)
  })

  test('concurrent approval of overlapping Space requests allows only one hold', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const secondCustomer = await UserFactory.apply('user', 'verified').create()
    const first = await client
      .post('/api/users/booking-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({
        spaceId: space.id,
        startsAt,
        endsAt,
        eventType: 'wedding',
        attendance: 100,
        contactPreference: 'in_app',
        idempotencyKey: 'booking-race-001',
      })
    const second = await client
      .post('/api/users/booking-requests')
      .withGuard('api')
      .loginAs(secondCustomer)
      .json({
        spaceId: space.id,
        startsAt,
        endsAt,
        eventType: 'wedding',
        attendance: 80,
        contactPreference: 'in_app',
        idempotencyKey: 'booking-race-002',
      })
    const results = await Promise.all([
      client
        .post(`/api/companies/booking-requests/${first.body().data.id}/approve`)
        .withGuard('api')
        .loginAs(owner),
      client
        .post(`/api/companies/booking-requests/${second.body().data.id}/approve`)
        .withGuard('api')
        .loginAs(owner),
    ])
    assert.deepEqual(results.map((response) => response.status()).sort(), [200, 409])
    assert.lengthOf(await db.from('booking_holds').where('status', 'active'), 1)
    assert.lengthOf(await db.from('bookings').where('status', 'pending'), 1)
  })

  test('date inquiries and visits never reserve rentable inventory', async ({ client, assert }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const inquiry = await client
      .post('/api/users/date-inquiries')
      .withGuard('api')
      .loginAs(customer)
      .json({
        spaceId: space.id,
        preferredStartsAt: startsAt,
        preferredEndsAt: endsAt,
        subject: 'هل الموعد متاح؟',
        eventType: 'wedding',
        attendance: 100,
        contactPreference: 'in_app',
        idempotencyKey: 'date-inquiry-001',
      })
    inquiry.assertStatus(201)
    const answered = await client
      .post(`/api/companies/date-inquiries/${inquiry.body().data.id}/answer`)
      .withGuard('api')
      .loginAs(owner)
      .json({ message: 'نعم، الموعد متاح مبدئيًا' })
    answered.assertStatus(200)
    const visit = await client
      .post('/api/users/visit-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({
        spaceId: space.id,
        startsAt,
        endsAt,
        inquiryId: inquiry.body().data.id,
        idempotencyKey: 'visit-request-001',
      })
    visit.assertStatus(201)
    const confirmed = await client
      .post(`/api/companies/visit-requests/${visit.body().data.id}/confirm`)
      .withGuard('api')
      .loginAs(owner)
      .json({})
    confirmed.assertStatus(200)
    assert.equal(
      await db
        .from('space_inventory_blocks')
        .count('* as total')
        .first()
        .then((row) => Number(row?.total)),
      0
    )
  })

  test('tenant scope and RBAC prevent cross-company and viewer mutations', async ({ client }) => {
    const { company, customer, space, startsAt, endsAt } = await setup()
    const viewer = await UserFactory.apply('company', 'verified').create()
    await CompanyMembership.create({
      companyId: company.id,
      userId: viewer.id,
      role: 'viewer',
      status: 'active',
      joinedAt: DateTime.now(),
    })
    const inquiry = await client
      .post('/api/users/date-inquiries')
      .withGuard('api')
      .loginAs(customer)
      .json({
        spaceId: space.id,
        preferredStartsAt: startsAt,
        preferredEndsAt: endsAt,
        subject: 'استفسار',
        contactPreference: 'in_app',
        idempotencyKey: 'date-inquiry-002',
      })
    const forbidden = await client
      .post(`/api/companies/date-inquiries/${inquiry.body().data.id}/answer`)
      .withGuard('api')
      .loginAs(viewer)
      .json({ message: 'لا يجوز' })
    forbidden.assertStatus(403)
    const other = await setup()
    const hidden = await client
      .get(`/api/companies/date-inquiries/${inquiry.body().data.id}`)
      .withGuard('api')
      .loginAs(other.owner)
    hidden.assertStatus(404)
  })

  test('bounded expiry preserves history and writes audit events', async ({ client, assert }) => {
    const { customer, space, startsAt, endsAt } = await setup()
    const inquiry = await client
      .post('/api/users/date-inquiries')
      .withGuard('api')
      .loginAs(customer)
      .json({
        spaceId: space.id,
        preferredStartsAt: startsAt,
        preferredEndsAt: endsAt,
        subject: 'استفسار سينتهي',
        contactPreference: 'in_app',
        idempotencyKey: 'date-inquiry-003',
      })
    await db
      .from('space_inquiries')
      .where('id', inquiry.body().data.id)
      .update({ response_expires_at: DateTime.now().minus({ minute: 1 }).toSQL() })
    assert.equal(await requestWorkflow.expirePending(), 1)
    const expiredInquiry = await db
      .from('space_inquiries')
      .where('id', inquiry.body().data.id)
      .firstOrFail()
    assert.equal(expiredInquiry.status, 'expired')
    assert.lengthOf(
      await db
        .from('inquiry_events')
        .where('inquiry_id', inquiry.body().data.id)
        .where('action', 'inquiry.expire'),
      1
    )
    const expiryIntent = await db
      .from('notification_outbox')
      .whereRaw("payload->>'type' = ?", ['date_inquiry_expired'])
      .firstOrFail()
    assert.equal(expiryIntent.payload.userId, customer.id)
  })

  test('idempotency key reuse with a different payload returns 409', async ({ client }) => {
    const { customer, space, startsAt, endsAt } = await setup()
    const payload = {
      spaceId: space.id,
      startsAt,
      endsAt,
      eventType: 'wedding',
      attendance: 100,
      contactPreference: 'in_app',
      idempotencyKey: 'booking-reused-key',
    }
    await client
      .post('/api/users/booking-requests')
      .withGuard('api')
      .loginAs(customer)
      .json(payload)
    const reused = await client
      .post('/api/users/booking-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({ ...payload, attendance: 101 })
    reused.assertStatus(409)
    reused.assertBodyContains({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } })
  })

  test('customer retrieves the provider answer after outbox removal', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const inquiry = await client
      .post('/api/users/date-inquiries')
      .withGuard('api')
      .loginAs(customer)
      .json({
        spaceId: space.id,
        preferredStartsAt: startsAt,
        preferredEndsAt: endsAt,
        subject: 'تفاصيل الموعد',
        contactPreference: 'in_app',
        idempotencyKey: 'answer-retrieval',
      })
    await client
      .post(`/api/companies/date-inquiries/${inquiry.body().data.id}/answer`)
      .withGuard('api')
      .loginAs(owner)
      .json({ message: 'الإجابة الدائمة' })
    await db.from('notification_outbox').delete()
    const messages = await client
      .get(`/api/users/date-inquiries/${inquiry.body().data.id}/messages`)
      .withGuard('api')
      .loginAs(customer)
    messages.assertStatus(200)
    assert.deepInclude(messages.body().data[0], {
      body: 'الإجابة الدائمة',
      sender_type: 'company_member',
    })
  })

  test('confirmed visit survives provider-response expiry', async ({ client, assert }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const visit = await client
      .post('/api/users/visit-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({ spaceId: space.id, startsAt, endsAt, idempotencyKey: 'confirmed-expiry' })
    await client
      .post(`/api/companies/visit-requests/${visit.body().data.id}/confirm`)
      .withGuard('api')
      .loginAs(owner)
      .json({})
    await db
      .from('visit_requests')
      .where('id', visit.body().data.id)
      .update({ response_expires_at: DateTime.now().minus({ hour: 1 }).toSQL() })
    assert.equal(await requestWorkflow.expirePending(), 0)
    const confirmedVisit = await db
      .from('visit_requests')
      .where('id', visit.body().data.id)
      .firstOrFail()
    assert.equal(confirmedVisit.status, 'confirmed')
  })

  test('alternative visit time requires customer acceptance', async ({ client, assert }) => {
    const { owner, customer, space, day, startsAt, endsAt } = await setup()
    const visit = await client
      .post('/api/users/visit-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({ spaceId: space.id, startsAt, endsAt, idempotencyKey: 'visit-alternative' })
    const proposed = await client
      .post(`/api/companies/visit-requests/${visit.body().data.id}/confirm`)
      .withGuard('api')
      .loginAs(owner)
      .json({ startsAt: day.set({ hour: 13 }).toISO(), endsAt: day.set({ hour: 14 }).toISO() })
    assert.equal(proposed.body().data.status, 'alternative_proposed')
    const accepted = await client
      .post(`/api/users/visit-requests/${visit.body().data.id}/alternative/accept`)
      .withGuard('api')
      .loginAs(customer)
    accepted.assertStatus(200)
    assert.equal(accepted.body().data.status, 'confirmed')
  })

  test('rejects an alternative whose end does not follow its start without side effects', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, day, startsAt, endsAt } = await setup()
    const visit = await client
      .post('/api/users/visit-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({ spaceId: space.id, startsAt, endsAt, idempotencyKey: 'alternative-reversed' })
    const visitId = visit.body().data.id
    const before = await db.from('visit_requests').where('id', visitId).firstOrFail()
    const eventCount = await db
      .from('visit_events')
      .where('visit_id', visitId)
      .count('* as total')
      .first()
    const outboxCount = await db.from('notification_outbox').count('* as total').first()

    const response = await client
      .post(`/api/companies/visit-requests/${visitId}/confirm`)
      .withGuard('api')
      .loginAs(owner)
      .json({ startsAt: day.set({ hour: 15 }).toISO(), endsAt: day.set({ hour: 14 }).toISO() })

    response.assertStatus(422)
    response.assertBodyContains({ error: { code: 'REQUEST_TIME_INVALID' } })
    const after = await db.from('visit_requests').where('id', visitId).firstOrFail()
    assert.equal(after.status, before.status)
    assert.equal(after.lock_version, before.lock_version)
    const finalEventCount = await db
      .from('visit_events')
      .where('visit_id', visitId)
      .count('* as total')
      .first()
    const finalOutboxCount = await db.from('notification_outbox').count('* as total').first()
    assert.equal(Number(finalEventCount?.total), Number(eventCount?.total))
    assert.equal(Number(finalOutboxCount?.total), Number(outboxCount?.total))
  })

  test('rejects an alternative start in the past', async ({ client }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const visit = await client
      .post('/api/users/visit-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({ spaceId: space.id, startsAt, endsAt, idempotencyKey: 'alternative-past' })
    const response = await client
      .post(`/api/companies/visit-requests/${visit.body().data.id}/confirm`)
      .withGuard('api')
      .loginAs(owner)
      .json({
        startsAt: DateTime.now().minus({ hours: 2 }).toUTC().toISO(),
        endsAt: DateTime.now().minus({ hours: 1 }).toUTC().toISO(),
      })
    response.assertStatus(422)
    response.assertBodyContains({ error: { code: 'REQUEST_TIME_INVALID' } })
  })

  test('rejects direct confirmation after the requested visit start has passed', async ({
    client,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const visit = await client
      .post('/api/users/visit-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({ spaceId: space.id, startsAt, endsAt, idempotencyKey: 'direct-confirm-past' })
    await db
      .from('visit_requests')
      .where('id', visit.body().data.id)
      .update({
        starts_at: DateTime.now().minus({ hours: 2 }).toUTC().toSQL(),
        ends_at: DateTime.now().minus({ hours: 1 }).toUTC().toSQL(),
      })
    const response = await client
      .post(`/api/companies/visit-requests/${visit.body().data.id}/confirm`)
      .withGuard('api')
      .loginAs(owner)
      .json({})
    response.assertStatus(422)
    response.assertBodyContains({ error: { code: 'REQUEST_TIME_INVALID' } })
  })

  test('rejects customer acceptance after the proposed appointment has passed', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, day, startsAt, endsAt } = await setup()
    const visit = await client
      .post('/api/users/visit-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({ spaceId: space.id, startsAt, endsAt, idempotencyKey: 'accept-elapsed-alternative' })
    const visitId = visit.body().data.id
    await client
      .post(`/api/companies/visit-requests/${visitId}/confirm`)
      .withGuard('api')
      .loginAs(owner)
      .json({ startsAt: day.set({ hour: 15 }).toISO(), endsAt: day.set({ hour: 16 }).toISO() })
    await db
      .from('visit_requests')
      .where('id', visitId)
      .update({
        proposed_starts_at: DateTime.now().minus({ hours: 2 }).toUTC().toSQL(),
        proposed_ends_at: DateTime.now().minus({ hours: 1 }).toUTC().toSQL(),
      })
    const before = await db.from('visit_requests').where('id', visitId).firstOrFail()
    const eventCount = await db
      .from('visit_events')
      .where('visit_id', visitId)
      .count('* as total')
      .first()
    const outboxCount = await db.from('notification_outbox').count('* as total').first()

    const response = await client
      .post(`/api/users/visit-requests/${visitId}/alternative/accept`)
      .withGuard('api')
      .loginAs(customer)

    response.assertStatus(422)
    response.assertBodyContains({ error: { code: 'REQUEST_TIME_INVALID' } })
    const after = await db.from('visit_requests').where('id', visitId).firstOrFail()
    assert.equal(after.status, 'alternative_proposed')
    assert.equal(after.lock_version, before.lock_version)
    const finalEventCount = await db
      .from('visit_events')
      .where('visit_id', visitId)
      .count('* as total')
      .first()
    const finalOutboxCount = await db.from('notification_outbox').count('* as total').first()
    assert.equal(Number(finalEventCount?.total), Number(eventCount?.total))
    assert.equal(Number(finalOutboxCount?.total), Number(outboxCount?.total))
  })

  test('all company inquiry and visit responses redact customer email', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const inquiry = await client
      .post('/api/users/date-inquiries')
      .withGuard('api')
      .loginAs(customer)
      .json({
        spaceId: space.id,
        preferredStartsAt: startsAt,
        preferredEndsAt: endsAt,
        subject: 'خصوصية',
        contactPreference: 'email',
        idempotencyKey: 'redact-inquiry',
      })
    const inquiryId = inquiry.body().data.id
    const inquiryResponses = [
      await client.get('/api/companies/date-inquiries').withGuard('api').loginAs(owner),
      await client
        .get(`/api/companies/date-inquiries/${inquiryId}`)
        .withGuard('api')
        .loginAs(owner),
      await client
        .post(`/api/companies/date-inquiries/${inquiryId}/answer`)
        .withGuard('api')
        .loginAs(owner)
        .json({ message: 'رد' }),
    ]
    for (const [index, result] of inquiryResponses.entries())
      assert.notProperty(
        index === 0 ? result.body().data[0] : result.body().data,
        'customer_email_snapshot'
      )
    const visit = await client
      .post('/api/users/visit-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({ spaceId: space.id, startsAt, endsAt, idempotencyKey: 'redact-visit' })
    const visitId = visit.body().data.id
    const visitResponses = [
      await client.get('/api/companies/visit-requests').withGuard('api').loginAs(owner),
      await client.get(`/api/companies/visit-requests/${visitId}`).withGuard('api').loginAs(owner),
      await client
        .post(`/api/companies/visit-requests/${visitId}/confirm`)
        .withGuard('api')
        .loginAs(owner)
        .json({}),
    ]
    for (const [index, result] of visitResponses.entries())
      assert.notProperty(
        index === 0 ? result.body().data[0] : result.body().data,
        'customer_email_snapshot'
      )
  })

  test('company notification fanout respects permissions, overrides, and membership status', async ({
    client,
    assert,
  }) => {
    const { company, customer, space, startsAt, endsAt } = await setup()
    const employee = await UserFactory.apply('company', 'verified').create()
    const revoked = await UserFactory.apply('company', 'verified').create()
    const denied = await UserFactory.apply('company', 'verified').create()
    await CompanyMembership.create({
      companyId: company.id,
      userId: employee.id,
      role: 'booking_staff',
      status: 'active',
      joinedAt: DateTime.now(),
    })
    await CompanyMembership.create({
      companyId: company.id,
      userId: revoked.id,
      role: 'booking_staff',
      status: 'revoked',
      joinedAt: DateTime.now(),
    })
    const deniedMembership = await CompanyMembership.create({
      companyId: company.id,
      userId: denied.id,
      role: 'viewer',
      status: 'active',
      joinedAt: DateTime.now(),
    })
    await CompanyMembershipPermission.create({
      companyMembershipId: deniedMembership.id,
      permission: 'inquiries.view',
      effect: 'deny',
    })
    await db.from('notification_outbox').delete()
    await client.post('/api/users/date-inquiries').withGuard('api').loginAs(customer).json({
      spaceId: space.id,
      preferredStartsAt: startsAt,
      preferredEndsAt: endsAt,
      subject: 'Fanout',
      contactPreference: 'in_app',
      idempotencyKey: 'fanout-inquiry',
    })
    const outboxRows = await db.from('notification_outbox')
    const recipients = outboxRows.map((row) => row.payload.userId)
    assert.sameMembers(recipients, [company.userId, employee.id])
    assert.notInclude(recipients, revoked.id)
    assert.notInclude(recipients, denied.id)
  })

  test('customer cancellation writes a durable company notification', async ({
    client,
    assert,
  }) => {
    const { company, customer, space, startsAt, endsAt } = await setup()
    const inquiry = await client
      .post('/api/users/date-inquiries')
      .withGuard('api')
      .loginAs(customer)
      .json({
        spaceId: space.id,
        preferredStartsAt: startsAt,
        preferredEndsAt: endsAt,
        subject: 'Cancel',
        contactPreference: 'in_app',
        idempotencyKey: 'cancel-inquiry',
      })
    await db.from('notification_outbox').delete()
    await client
      .post(`/api/users/date-inquiries/${inquiry.body().data.id}/cancel`)
      .withGuard('api')
      .loginAs(customer)
    const outbox = await db.from('notification_outbox').firstOrFail()
    assert.equal(outbox.payload.userId, company.userId)
    assert.equal(outbox.payload.type, 'date_inquiry_cancelled')
  })

  test('concurrent customer and provider visit transitions permit one winner', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, day, startsAt, endsAt } = await setup()
    const visit = await client
      .post('/api/users/visit-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({ spaceId: space.id, startsAt, endsAt, idempotencyKey: 'visit-race' })
    const proposed = await client
      .post(`/api/companies/visit-requests/${visit.body().data.id}/confirm`)
      .withGuard('api')
      .loginAs(owner)
      .json({ startsAt: day.set({ hour: 14 }).toISO(), endsAt: day.set({ hour: 15 }).toISO() })
    const results = await Promise.all([
      client
        .post(`/api/users/visit-requests/${visit.body().data.id}/alternative/accept`)
        .withGuard('api')
        .loginAs(customer),
      client
        .post(`/api/companies/visit-requests/${visit.body().data.id}/cancel`)
        .withGuard('api')
        .loginAs(owner)
        .json({ reason: 'Cancelled', lockVersion: proposed.body().data.lock_version }),
    ])
    assert.equal(results.filter((result) => result.status() === 200).length, 1)
    assert.include([404, 409], results.find((result) => result.status() !== 200)!.status())
  })

  test('Space suspension before approval leaves the request pending', async ({
    client,
    assert,
  }) => {
    const { owner, customer, space, startsAt, endsAt } = await setup()
    const booking = await client
      .post('/api/users/booking-requests')
      .withGuard('api')
      .loginAs(customer)
      .json({
        spaceId: space.id,
        startsAt,
        endsAt,
        eventType: 'wedding',
        attendance: 100,
        contactPreference: 'in_app',
        idempotencyKey: 'suspended-booking',
      })
    await db.from('spaces').where('id', space.id).update({ publication_status: 'suspended' })
    const approval = await client
      .post(`/api/companies/booking-requests/${booking.body().data.id}/approve`)
      .withGuard('api')
      .loginAs(owner)
    approval.assertStatus(409)
    const pendingBooking = await db
      .from('bookings')
      .where('id', booking.body().data.id)
      .firstOrFail()
    assert.equal(pendingBooking.status, 'pending')
  })

  test('rollback guard refuses a real Space-only Booking', async ({ client, assert }) => {
    const { customer, space, startsAt, endsAt } = await setup()
    await client.post('/api/users/booking-requests').withGuard('api').loginAs(customer).json({
      spaceId: space.id,
      startsAt,
      endsAt,
      eventType: 'wedding',
      attendance: 100,
      contactPreference: 'in_app',
      idempotencyKey: 'rollback-booking',
    })
    const count = await db.from('bookings').whereNull('hall_id').count('* as total').firstOrFail()
    assert.throws(() => assertSprint4RollbackSafe(Number(count.total)), /Space-only Booking/)
  })
})
