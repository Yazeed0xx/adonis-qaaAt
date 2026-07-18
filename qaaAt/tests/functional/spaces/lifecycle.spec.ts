import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import Space from '#models/space'
import { seedReferenceData } from '#database/seeding/reference_data'
import { createAdmin, createApprovedCompanyOwner } from '#tests/support/actors'

function resourceId(body: unknown) {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('data' in body) ||
    typeof body.data !== 'object' ||
    body.data === null ||
    Array.isArray(body.data) ||
    !('id' in body.data) ||
    typeof body.data.id !== 'number'
  ) {
    throw new Error('Expected a single resource response containing a numeric data.id')
  }

  return body.data.id
}

async function createVenue(client: ApiClient, ownerId: number, companyId: number) {
  const owner = await import('#models/user').then(({ default: User }) => User.findOrFail(ownerId))
  const response = await client
    .visit('venues.store')
    .withGuard('api')
    .loginAs(owner, companyTokenAbilities(companyId))
    .json({ name: { ar: 'المركز الرئيسي' }, city: 'Riyadh', district: 'Olaya' })
  response.assertStatus(201)
  return resourceId(response.body())
}

test.group('Space publication lifecycle', (group) => {
  group.each.setup(withTruncateIsolation)

  test('an owner creates, submits, corrects, publishes, suspends, restores, and archives a Space', async ({
    client,
    assert,
  }) => {
    await seedReferenceData()
    const { user: owner, company } = await createApprovedCompanyOwner()
    const admin = await createAdmin()
    const venueId = await createVenue(client, owner.id, company.id)

    const created = await client
      .visit('spaces.store')
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
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
    const spaceId = resourceId(created.body())

    const submitted = await client
      .visit('spaces.submit', { id: spaceId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
    submitted.assertStatus(200)
    submitted.assertBodyContains({ data: { publicationStatus: 'pending_review' } })

    const changes = await client
      .visit('admin_spaces.request_changes', { id: spaceId })
      .withGuard('api')
      .loginAs(admin)
      .json({ reason: 'Please provide a clearer capacity description.' })
    changes.assertStatus(200)
    changes.assertBodyContains({ data: { publicationStatus: 'changes_requested' } })

    const corrected = await client
      .visit('spaces.update', { id: spaceId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
      .json({ description: { ar: 'قاعة زفاف فاخرة بسعة واضحة' } })
    corrected.assertStatus(200)
    await client
      .visit('spaces.submit', { id: spaceId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
      .then((response) => response.assertStatus(200))

    const published = await client
      .visit('admin_spaces.publish', { id: spaceId })
      .withGuard('api')
      .loginAs(admin)
    published.assertStatus(200)
    const publicResponse = await client.visit('public_spaces.show', { id: spaceId })
    publicResponse.assertStatus(200)
    publicResponse.assertBodyContains({
      data: { name: 'قاعة الياسمين', publicationStatus: 'published' },
    })

    const failedPublishedEdit = await client
      .visit('spaces.update', { id: spaceId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
      .json({ description: { ar: 'يجب التراجع عن هذا الوصف' }, amenityIds: [999999] })
    failedPublishedEdit.assertStatus(422)
    const unchangedSpace = await Space.findOrFail(spaceId)
    assert.equal(unchangedSpace.publicationStatus, 'published')
    const stillPublic = await client.visit('public_spaces.show', { id: spaceId })
    stillPublic.assertStatus(200)

    const publishedEdit = await client
      .visit('spaces.update', { id: spaceId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
      .json({ description: { ar: 'وصف جديد يحتاج مراجعة' } })
    publishedEdit.assertStatus(200)
    publishedEdit.assertBodyContains({ data: { publicationStatus: 'pending_review' } })
    const hiddenAfterEdit = await client.visit('public_spaces.show', { id: spaceId })
    hiddenAfterEdit.assertStatus(404)

    await client
      .visit('admin_spaces.publish', { id: spaceId })
      .withGuard('api')
      .loginAs(admin)
      .then((response) => response.assertStatus(200))
    const suspended = await client
      .visit('admin_spaces.suspend', { id: spaceId })
      .withGuard('api')
      .loginAs(admin)
      .json({ reason: 'Temporarily offline for moderation review.' })
    suspended.assertStatus(200)
    const suspendedEdit = await client
      .visit('spaces.update', { id: spaceId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
      .json({ name: { en: 'Forbidden while suspended' } })
    suspendedEdit.assertStatus(409)
    suspendedEdit.assertBodyContains({ error: { code: 'SPACE_EDIT_INVALID_STATE' } })

    await client
      .visit('admin_spaces.publish', { id: spaceId })
      .withGuard('api')
      .loginAs(admin)
      .then((response) => response.assertStatus(200))

    const events = await db.from('space_moderation_events').where('space_id', spaceId).orderBy('id')
    assert.includeMembers(
      events.map((event) => event.next_status),
      ['draft', 'pending_review', 'changes_requested', 'published', 'suspended']
    )
    assert.equal(
      events.find((event) => event.action === 'changes_requested')?.reason,
      'Please provide a clearer capacity description.'
    )
    assert.deepInclude(
      events.find((event) => event.action === 'provider_edit_submitted_for_review'),
      { previous_status: 'published', next_status: 'pending_review' }
    )

    const archived = await client
      .visit('spaces.destroy', { id: spaceId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
    archived.assertStatus(204)
    const archivedEdit = await client
      .visit('spaces.update', { id: spaceId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
      .json({ name: { en: 'Forbidden while archived' } })
    archivedEdit.assertStatus(404)
  })

  test('changing category atomically replaces incompatible normalized details', async ({
    client,
    assert,
  }) => {
    await seedReferenceData()
    const { user: owner, company } = await createApprovedCompanyOwner()
    const venueId = await createVenue(client, owner.id, company.id)
    const created = await client
      .visit('spaces.store')
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
      .json({
        venueId,
        category: 'meeting_room',
        name: { en: 'Convertible room' },
        bookingMode: 'request_to_book',
        capacityTotal: 30,
        layoutCapacities: [{ layout: 'boardroom', capacity: 20 }],
      })
    created.assertStatus(201)
    const spaceId = resourceId(created.body())

    const toEvent = await client
      .visit('spaces.update', { id: spaceId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
      .json({
        category: 'wedding_hall',
        eventDetails: { maleCapacity: 15, femaleCapacity: 15 },
      })
    toEvent.assertStatus(200)
    assert.lengthOf(await db.from('space_layout_capacities').where('space_id', spaceId), 0)
    assert.lengthOf(await db.from('space_event_details').where('space_id', spaceId), 1)

    const toLayout = await client
      .visit('spaces.update', { id: spaceId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
      .json({
        category: 'training_room',
        layoutCapacities: [{ layout: 'classroom', capacity: 24 }],
      })
    toLayout.assertStatus(200)
    assert.lengthOf(await db.from('space_event_details').where('space_id', spaceId), 0)
    const layouts = await db.from('space_layout_capacities').where('space_id', spaceId)
    assert.deepInclude(layouts[0], {
      layout: 'classroom',
      capacity: 24,
    })
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
