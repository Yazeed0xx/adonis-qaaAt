import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { seedReferenceData } from '#database/seeding/reference_data'
import { createAdmin, createCustomer } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'

test.group('Admin controlled catalog', (group) => {
  group.each.setup(withTruncateIsolation)

  test('requires an admin and returns active and inactive definitions', async ({ client }) => {
    await seedReferenceData()
    const customer = await createCustomer({ email: 'catalog-customer@example.com' })
    const denied = await client
      .get('/api/admin/catalog')
      .withGuard('api')
      .loginAs(customer, ['client:customer_app'])
    denied.assertStatus(403)

    const admin = await createAdmin({ email: 'catalog-admin@example.com' })
    const response = await client.get('/api/admin/catalog').withGuard('api').loginAs(admin)
    response.assertStatus(200)
    response.assertBodyContains({
      data: { categories: [{ slug: 'wedding_hall', isActive: true }] },
    })
  })

  test('updates a fixed category without allowing arbitrary category creation', async ({
    client,
    assert,
  }) => {
    await seedReferenceData()
    const admin = await createAdmin({ email: 'category-admin@example.com' })
    const category = await db.from('space_categories').where('slug', 'meeting_room').firstOrFail()

    const response = await client
      .patch(`/api/admin/categories/${category.id}`)
      .withGuard('api')
      .loginAs(admin)
      .json({ nameEn: 'Business meeting room', isActive: false, sortOrder: 900 })
    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        id: category.id,
        slug: 'meeting_room',
        nameEn: 'Business meeting room',
        isActive: false,
        sortOrder: 900,
      },
    })
    assert.lengthOf(
      await db
        .from('admin_audit_logs')
        .where({ action: 'space_category.update', target_id: category.id }),
      1
    )

    const publicCatalog = await client.get('/api/space-catalog')
    publicCatalog.assertStatus(200)
    assert.notInclude(
      publicCatalog.body().data.categories.map((item: { slug: string }) => item.slug),
      'meeting_room'
    )
    const unsupportedCreate = await client
      .post('/api/admin/categories')
      .withGuard('api')
      .loginAs(admin)
    unsupportedCreate.assertStatus(404)
  })

  test('creates and updates an amenity with uniqueness and audit guarantees', async ({
    client,
    assert,
  }) => {
    const admin = await createAdmin({ email: 'amenity-admin@example.com' })
    const input = {
      slug: 'ev_charging',
      nameAr: 'شحن المركبات الكهربائية',
      nameEn: 'EV charging',
      group: 'parking',
      isSearchable: true,
    }
    const created = await client
      .post('/api/admin/amenities')
      .withGuard('api')
      .loginAs(admin)
      .json(input)
    created.assertStatus(201)
    const amenityId = created.body().data.id

    const duplicate = await client
      .post('/api/admin/amenities')
      .withGuard('api')
      .loginAs(admin)
      .json(input)
    duplicate.assertStatus(409)
    duplicate.assertBodyContains({ error: { code: 'AMENITY_SLUG_CONFLICT' } })

    const updated = await client
      .patch(`/api/admin/amenities/${amenityId}`)
      .withGuard('api')
      .loginAs(admin)
      .json({ isActive: false, isSearchable: false })
    updated.assertStatus(200)
    updated.assertBodyContains({ data: { isActive: false, isSearchable: false } })
    const auditLogs = await db.from('admin_audit_logs').orderBy('id')
    assert.deepEqual(
      auditLogs.map((row) => row.action),
      ['amenity.create', 'amenity.update']
    )
  })
})
