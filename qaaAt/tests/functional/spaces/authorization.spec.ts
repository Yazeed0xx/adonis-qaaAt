import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import { seedReferenceData } from '#database/seeding/reference_data'
import { createApprovedCompanyOwner, createCompanyMember } from '#tests/support/actors'

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

test.group('Venue and Space authorization', (group) => {
  group.each.setup(withTruncateIsolation)

  test('an owner manages a localized Venue while viewers are read-only and other tenants see 404', async ({
    client,
    assert,
  }) => {
    const first = await createApprovedCompanyOwner()
    const second = await createApprovedCompanyOwner()
    const viewer = await createCompanyMember(first.company, 'viewer')

    const created = await client
      .visit('venues.store')
      .withGuard('api')
      .loginAs(first.user, companyTokenAbilities(first.company))
      .json({
        name: { ar: 'مركز النخيل', en: 'Palm Center' },
        city: 'Riyadh',
        district: 'Olaya',
        timezone: 'Asia/Riyadh',
      })
    created.assertStatus(201)
    created.assertBodyContains({
      data: { name: 'مركز النخيل', city: 'Riyadh', district: 'Olaya', timezone: 'Asia/Riyadh' },
    })
    const venueId = resourceId(created.body())

    const listed = await client
      .visit('venues.index')
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
    listed.assertStatus(200)
    listed.assertBodyContains({ data: [{ id: venueId, name: 'مركز النخيل' }] })
    const shown = await client
      .visit('venues.show', { id: venueId })
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
    shown.assertStatus(200)

    const denied = await client
      .visit('venues.update', { id: venueId })
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
      .json({ district: 'Al Malqa' })
    denied.assertStatus(403)
    const unchangedVenue = await db.from('venues').where('id', venueId).firstOrFail()
    assert.equal(unchangedVenue.district, 'Olaya')

    const hidden = await client
      .visit('venues.show', { id: venueId })
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
    hidden.assertStatus(404)
    const updated = await client
      .visit('venues.update', { id: venueId })
      .withGuard('api')
      .loginAs(first.user, companyTokenAbilities(first.company))
      .json({ district: 'Al Malqa' })
    updated.assertStatus(200)
    updated.assertBodyContains({ data: { id: venueId, district: 'Al Malqa' } })
  })

  test('Space creation rejects insufficient permission and a foreign Venue without writing rows', async ({
    client,
    assert,
  }) => {
    await seedReferenceData()
    const first = await createApprovedCompanyOwner()
    const second = await createApprovedCompanyOwner()
    const viewer = await createCompanyMember(first.company, 'viewer')
    const venue = await client
      .visit('venues.store')
      .withGuard('api')
      .loginAs(first.user, companyTokenAbilities(first.company))
      .json({ name: { en: 'Owner venue' }, city: 'Riyadh' })
    venue.assertStatus(201)
    const venueId = resourceId(venue.body())
    const payload = {
      venueId,
      category: 'meeting_room' as const,
      name: { en: 'Tenant-scoped room' },
      bookingMode: 'request_to_book' as const,
      capacityTotal: 10,
    }

    const denied = await client
      .visit('spaces.store')
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
      .json(payload)
    denied.assertStatus(403)
    const foreign = await client
      .visit('spaces.store')
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
      .json(payload)
    foreign.assertStatus(404)
    const spacesAfterDenials = await db.from('spaces').count('* as total').firstOrFail()
    assert.equal(Number(spacesAfterDenials.total), 0)
  })

  test('Space validation rejects empty localization, instant booking, and category-incompatible details', async ({
    client,
    assert,
  }) => {
    await seedReferenceData()
    const owner = await createApprovedCompanyOwner()
    const venue = await client
      .visit('venues.store')
      .withGuard('api')
      .loginAs(owner.user, companyTokenAbilities(owner.company))
      .json({ name: { en: 'Validation venue' }, city: 'Riyadh' })
    venue.assertStatus(201)
    const venueId = resourceId(venue.body())

    const invalidPayloads = [
      {
        venueId,
        category: 'meeting_room',
        name: {},
        bookingMode: 'request_to_book',
        capacityTotal: 10,
      },
      {
        venueId,
        category: 'meeting_room',
        name: { en: 'Instant' },
        bookingMode: 'instant_book',
        capacityTotal: 10,
      },
      {
        venueId,
        category: 'meeting_room',
        name: { en: 'Wrong details' },
        bookingMode: 'request_to_book',
        capacityTotal: 10,
        largeFormatDetails: { floorAreaSqm: 100 },
      },
    ]

    for (const payload of invalidPayloads) {
      const response = await client
        .post('/api/companies/spaces')
        .withGuard('api')
        .loginAs(owner.user, companyTokenAbilities(owner.company))
        .json(payload)
      response.assertStatus(422)
    }
    const spacesAfterValidation = await db.from('spaces').count('* as total').firstOrFail()
    assert.equal(Number(spacesAfterValidation.total), 0)
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
