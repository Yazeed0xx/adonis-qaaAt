import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { MigrationRunner } from '@adonisjs/lucid/migration'
import type User from '#models/user'
import CompanyMembership from '#models/company_membership'
import Hall from '#models/hall'
import Space from '#models/space'
import { UserFactory } from '#database/factories/user_factory'
import { CompanyFactory } from '#database/factories/company_factory'
import { HallFactory } from '#database/factories/hall_factory'
import { BookingFactory } from '#database/factories/booking_factory'
import BackfillMigration from '#database/migrations/1770000000011_seed_catalogs_and_backfill_halls'
import { HallService } from '#services/hall_service'

async function seedCatalogsAndBackfill() {
  await new BackfillMigration(db.connection(), import.meta.url).up()
}

async function companyWithOwner() {
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
  return { owner, company }
}

async function createVenue(client: any, owner: User) {
  const response = await client
    .post('/api/companies/venues')
    .withGuard('api')
    .loginAs(owner)
    .json({ name: { ar: 'المركز الرئيسي' }, city: 'Riyadh', district: 'Olaya' })
  response.assertStatus(201)
  return response.body().data.id as number
}

test.group('Sprint 2 venues, spaces, moderation, and Hall compatibility', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('real backfill preserves Hall, Booking, publication, operational availability, and imported media', async ({
    client,
    assert,
  }) => {
    const { company } = await companyWithOwner()
    const customer = await UserFactory.apply('user', 'verified').create()
    const hall = await HallFactory.merge({
      companyId: company.id,
      isAvailable: false,
      name: 'Legacy Wedding Hall',
      images: ['https://legacy.example/hall.jpg'],
    }).create()
    const booking = await BookingFactory.apply('confirmed')
      .merge({ hallId: hall.id, userId: customer.id })
      .create()
    await seedCatalogsAndBackfill()

    const space = await Space.findByOrFail('legacyHallId', hall.id)
    assert.equal(space.publicationStatus, 'published')
    assert.equal(space.legacyIsAvailable, false)
    assert.equal(space.legacyName, hall.name)
    const venue = await db.from('venues').where('id', space.venueId).firstOrFail()
    assert.equal(venue.legacy_location, hall.location)
    assert.isNull(venue.district)
    await booking.refresh()
    assert.equal(booking.hallId, hall.id)
    assert.equal((await Hall.find(hall.id)) !== null, true)
    const media = await db.from('space_media').where('space_id', space.id).firstOrFail()
    assert.equal(media.provenance, 'legacy_imported')
    assert.equal(media.legacy_reference, 'https://legacy.example/hall.jpg')

    const publicResponse = await client.get(`/api/spaces/${space.id}`)
    publicResponse.assertStatus(404)
  })

  test('new localized Space follows changes-requested, publish, suspend, and restore lifecycle', async ({
    client,
    assert,
  }) => {
    await seedCatalogsAndBackfill()
    const { owner } = await companyWithOwner()
    const admin = await UserFactory.apply('admin', 'verified').create()
    const venueId = await createVenue(client, owner)
    const created = await client
      .post('/api/companies/spaces')
      .withGuard('api')
      .loginAs(owner)
      .json({
        venueId,
        category: 'wedding_hall',
        name: { ar: 'قاعة الياسمين', en: 'Jasmine Hall' },
        description: { ar: 'قاعة زفاف فاخرة' },
        bookingMode: 'quote_required',
        capacityTotal: 400,
        requiresVisit: true,
        eventDetails: {
          maleCapacity: 180,
          femaleCapacity: 220,
          hasBridalRoom: true,
          hasStage: true,
        },
      })
    created.assertStatus(201)
    created.assertBodyContains({
      data: {
        name: 'قاعة الياسمين',
        publicationStatus: 'draft',
        category: { slug: 'wedding_hall' },
      },
    })
    const spaceId = created.body().data.id

    const firstSubmission = await client
      .post(`/api/companies/spaces/${spaceId}/submissions`)
      .withGuard('api')
      .loginAs(owner)
    firstSubmission.assertStatus(200)
    const changes = await client
      .post(`/api/admin/spaces/${spaceId}/request-changes`)
      .withGuard('api')
      .loginAs(admin)
      .json({ reason: 'Please provide a clearer capacity description.' })
    changes.assertStatus(200)
    changes.assertBodyContains({ data: { publicationStatus: 'changes_requested' } })
    const corrected = await client
      .patch(`/api/companies/spaces/${spaceId}`)
      .withGuard('api')
      .loginAs(owner)
      .json({ description: { ar: 'قاعة زفاف فاخرة بسعة واضحة' } })
    corrected.assertStatus(200)
    const resubmitted = await client
      .post(`/api/companies/spaces/${spaceId}/submissions`)
      .withGuard('api')
      .loginAs(owner)
    resubmitted.assertStatus(200)
    const published = await client
      .post(`/api/admin/spaces/${spaceId}/publish`)
      .withGuard('api')
      .loginAs(admin)
    published.assertStatus(200)
    const publicResponse = await client.get(`/api/spaces/${spaceId}`)
    publicResponse.assertStatus(200)
    publicResponse.assertBodyContains({
      data: { name: 'قاعة الياسمين', publicationStatus: 'published' },
    })
    const failedPublishedEdit = await client
      .patch(`/api/companies/spaces/${spaceId}`)
      .withGuard('api')
      .loginAs(owner)
      .json({ description: { ar: 'يجب التراجع عن هذا الوصف' }, amenityIds: [999999] })
    failedPublishedEdit.assertStatus(422)
    const unchangedPublishedSpace = await Space.findOrFail(spaceId)
    assert.equal(unchangedPublishedSpace.publicationStatus, 'published')
    const stillPublicAfterRollback = await client.get(`/api/spaces/${spaceId}`)
    stillPublicAfterRollback.assertStatus(200)
    const publishedEdit = await client
      .patch(`/api/companies/spaces/${spaceId}`)
      .withGuard('api')
      .loginAs(owner)
      .json({ description: { ar: 'وصف جديد يحتاج مراجعة' } })
    publishedEdit.assertStatus(200)
    publishedEdit.assertBodyContains({ data: { publicationStatus: 'pending_review' } })
    const hiddenAfterEdit = await client.get(`/api/spaces/${spaceId}`)
    hiddenAfterEdit.assertStatus(404)
    const republishedAfterEdit = await client
      .post(`/api/admin/spaces/${spaceId}/publish`)
      .withGuard('api')
      .loginAs(admin)
    republishedAfterEdit.assertStatus(200)
    const suspended = await client
      .post(`/api/admin/spaces/${spaceId}/suspend`)
      .withGuard('api')
      .loginAs(admin)
      .json({ reason: 'Temporarily offline for moderation review.' })
    suspended.assertStatus(200)
    const suspendedEdit = await client
      .patch(`/api/companies/spaces/${spaceId}`)
      .withGuard('api')
      .loginAs(owner)
      .json({ name: { en: 'Forbidden while suspended' } })
    suspendedEdit.assertStatus(409)
    suspendedEdit.assertBodyContains({ error: { code: 'SPACE_EDIT_INVALID_STATE' } })
    const hidden = await client.get(`/api/spaces/${spaceId}`)
    hidden.assertStatus(404)
    const restored = await client
      .post(`/api/admin/spaces/${spaceId}/publish`)
      .withGuard('api')
      .loginAs(admin)
    restored.assertStatus(200)

    const events = await db.from('space_moderation_events').where('space_id', spaceId).orderBy('id')
    const statuses = events.map((event) => event.next_status)
    for (const status of [
      'draft',
      'pending_review',
      'changes_requested',
      'published',
      'suspended',
    ]) {
      assert.include(statuses, status)
    }
    assert.equal(
      events.find((event) => event.action === 'changes_requested')?.reason,
      'Please provide a clearer capacity description.'
    )
    const editEvent = events.find((event) => event.action === 'provider_edit_submitted_for_review')
    assert.equal(editEvent?.previous_status, 'published')
    assert.equal(editEvent?.next_status, 'pending_review')

    const archived = await client
      .delete(`/api/companies/spaces/${spaceId}`)
      .withGuard('api')
      .loginAs(owner)
    archived.assertStatus(204)
    const archivedEdit = await client
      .patch(`/api/companies/spaces/${spaceId}`)
      .withGuard('api')
      .loginAs(owner)
      .json({ name: { en: 'Forbidden while archived' } })
    archivedEdit.assertStatus(404)
  })

  test('tenant scoping and spaces permissions prevent cross-company and unauthorized writes', async ({
    client,
  }) => {
    await seedCatalogsAndBackfill()
    const first = await companyWithOwner()
    const second = await companyWithOwner()
    const viewer = await UserFactory.apply('user', 'verified').create()
    await CompanyMembership.create({
      companyId: first.company.id,
      userId: viewer.id,
      role: 'viewer',
      status: 'active',
      joinedAt: first.company.createdAt,
    })
    const venueId = await createVenue(client, first.owner)
    const denied = await client
      .post('/api/companies/spaces')
      .withGuard('api')
      .loginAs(viewer)
      .json({
        venueId,
        category: 'meeting_room',
        name: { en: 'Denied' },
        bookingMode: 'request_to_book',
        capacityTotal: 10,
      })
    denied.assertStatus(403)
    const crossTenant = await client
      .post('/api/companies/spaces')
      .withGuard('api')
      .loginAs(second.owner)
      .json({
        venueId,
        category: 'meeting_room',
        name: { en: 'Wrong tenant' },
        bookingMode: 'request_to_book',
        capacityTotal: 10,
      })
    crossTenant.assertStatus(404)
  })

  test('legacy Hall updates sync allowlisted fields one way and reject reverse edits', async ({
    client,
    assert,
  }) => {
    await seedCatalogsAndBackfill()
    const { owner, company } = await companyWithOwner()
    const hallService = new HallService()
    const hall = await hallService.createHall(company.id, {
      name: 'Legacy Source',
      capacity: 200,
      location: 'Olaya',
      pricing: 5000,
      address: 'King Road',
      city: 'Riyadh',
      amenities: { parking: true },
      images: ['https://legacy.example/one.jpg'],
      services: [],
      isAvailable: true,
    })
    await hallService.updateHall(hall.id, company.id, {
      name: 'Legacy Updated',
      capacity: 250,
      isAvailable: false,
    })
    const space = await Space.findByOrFail('legacyHallId', hall.id)
    assert.equal(space.legacyName, 'Legacy Updated')
    assert.equal(space.capacityTotal, 250)
    assert.equal(space.legacyIsAvailable, false)
    assert.equal(space.publicationStatus, 'published')

    const reverse = await client
      .patch(`/api/companies/spaces/${space.id}`)
      .withGuard('api')
      .loginAs(owner)
      .json({ name: { ar: 'تغيير غير مسموح' } })
    reverse.assertStatus(409)
    reverse.assertBodyContains({ error: { code: 'LEGACY_SPACE_READ_ONLY' } })

    const admin = await UserFactory.apply('admin', 'verified').create()
    const ambiguousModeration = await client
      .post(`/api/admin/spaces/${space.id}/suspend`)
      .withGuard('api')
      .loginAs(admin)
      .json({ reason: 'This must use the legacy Hall compatibility workflow.' })
    ambiguousModeration.assertStatus(409)
    ambiguousModeration.assertBodyContains({
      error: { code: 'LEGACY_SPACE_MODERATION_VIA_HALL' },
    })
  })

  test('failed synchronized Hall update rolls back Hall and mapped Space', async ({ assert }) => {
    await seedCatalogsAndBackfill()
    const { company } = await companyWithOwner()
    const hallService = new HallService()
    const hall = await hallService.createHall(company.id, {
      name: 'Rollback Hall',
      capacity: 100,
      location: 'Olaya',
      pricing: 1000,
      address: 'Road',
      city: 'Riyadh',
      amenities: {},
      images: [],
      services: [],
      isAvailable: true,
    })
    const space = await Space.findByOrFail('legacyHallId', hall.id)
    await assert.rejects(() => hallService.updateHall(hall.id, company.id, { capacity: -1 }))
    await hall.refresh()
    await space.refresh()
    assert.equal(hall.capacity, 100)
    assert.equal(space.capacityTotal, 100)
  })

  test('new Space validation rejects unsupported localization, instant booking, and category detail shapes', async ({
    client,
  }) => {
    await seedCatalogsAndBackfill()
    const { owner } = await companyWithOwner()
    const venueId = await createVenue(client, owner)
    const noLocale = await client
      .post('/api/companies/spaces')
      .withGuard('api')
      .loginAs(owner)
      .json({
        venueId,
        category: 'meeting_room',
        name: {},
        bookingMode: 'request_to_book',
        capacityTotal: 10,
      })
    noLocale.assertStatus(422)
    const instant = await client
      .post('/api/companies/spaces')
      .withGuard('api')
      .loginAs(owner)
      .json({
        venueId,
        category: 'meeting_room',
        name: { en: 'Instant' },
        bookingMode: 'instant_book',
        capacityTotal: 10,
      })
    instant.assertStatus(422)
    const wrongDetails = await client
      .post('/api/companies/spaces')
      .withGuard('api')
      .loginAs(owner)
      .json({
        venueId,
        category: 'meeting_room',
        name: { en: 'Room' },
        bookingMode: 'request_to_book',
        capacityTotal: 10,
        largeFormatDetails: { floorAreaSqm: 100 },
      })
    wrongDetails.assertStatus(422)
  })

  test('category changes clear incompatible normalized details in both directions', async ({
    client,
    assert,
  }) => {
    await seedCatalogsAndBackfill()
    const { owner } = await companyWithOwner()
    const venueId = await createVenue(client, owner)
    const created = await client
      .post('/api/companies/spaces')
      .withGuard('api')
      .loginAs(owner)
      .json({
        venueId,
        category: 'meeting_room',
        name: { en: 'Convertible room' },
        bookingMode: 'request_to_book',
        capacityTotal: 30,
        layoutCapacities: [{ layout: 'boardroom', capacity: 20 }],
      })
    created.assertStatus(201)
    const spaceId = created.body().data.id

    const toEvent = await client
      .patch(`/api/companies/spaces/${spaceId}`)
      .withGuard('api')
      .loginAs(owner)
      .json({
        category: 'wedding_hall',
        eventDetails: { maleCapacity: 15, femaleCapacity: 15 },
      })
    toEvent.assertStatus(200)
    assert.lengthOf(await db.from('space_layout_capacities').where('space_id', spaceId), 0)
    assert.lengthOf(await db.from('space_event_details').where('space_id', spaceId), 1)

    const toLayout = await client
      .patch(`/api/companies/spaces/${spaceId}`)
      .withGuard('api')
      .loginAs(owner)
      .json({
        category: 'training_room',
        layoutCapacities: [{ layout: 'classroom', capacity: 24 }],
      })
    toLayout.assertStatus(200)
    assert.lengthOf(await db.from('space_event_details').where('space_id', spaceId), 0)
    const layouts = await db.from('space_layout_capacities').where('space_id', spaceId)
    assert.lengthOf(layouts, 1)
    assert.equal(layouts[0].layout, 'classroom')
  })

  test('Sprint 2 migrations roll back after new Space usage without touching Halls or Bookings', async ({
    client,
    assert,
  }) => {
    const { owner, company } = await companyWithOwner()
    const customer = await UserFactory.apply('user', 'verified').create()
    const hall = await HallFactory.merge({ companyId: company.id }).create()
    const booking = await BookingFactory.merge({ hallId: hall.id, userId: customer.id }).create()
    await seedCatalogsAndBackfill()
    const venueId = await createVenue(client, owner)
    const created = await client
      .post('/api/companies/spaces')
      .withGuard('api')
      .loginAs(owner)
      .json({
        venueId,
        category: 'meeting_room',
        name: { en: 'Post-migration room' },
        bookingMode: 'request_to_book',
        capacityTotal: 12,
      })
    created.assertStatus(201)

    let structuralTablesDropped = false
    let restoreError: Error | null = null
    try {
      const rollback = new MigrationRunner(db, app, {
        direction: 'down',
        step: 2,
        disableLocks: true,
      })
      await rollback.run()
      if (rollback.error) throw rollback.error
      structuralTablesDropped = true
      assert.isNull(
        await db
          .from('spaces')
          .first()
          .catch(() => null)
      )
      const preservedHall = await db.from('halls').where('id', hall.id).firstOrFail()
      const preservedBooking = await db.from('bookings').where('id', booking.id).firstOrFail()
      assert.equal(preservedHall.id, hall.id)
      assert.equal(preservedBooking.hall_id, hall.id)
    } finally {
      if (structuralTablesDropped) {
        const migrate = new MigrationRunner(db, app, {
          direction: 'up',
          disableLocks: true,
        })
        await migrate.run()
        restoreError = migrate.error
      }
    }
    if (restoreError) throw restoreError
  })
})
