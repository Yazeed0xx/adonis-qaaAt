import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import { UserFactory } from '#database/factories/user_factory'
import { createMediaScenario, tinyPng as png } from '#tests/support/scenarios/media'

test.group('Controlled Space media access', (group) => {
  group.each.setup(withTruncateIsolation)
  group.each.setup(() => {
    drive.fake('private')
    return () => drive.restore('private')
  })

  test('requires authentication and admin authorization without changing media state', async ({
    client,
    assert,
  }) => {
    const { owner, membership, spaceId } = await createMediaScenario()
    const unauthenticated = await client
      .post(`/api/companies/spaces/${spaceId}/media`)
      .file('image', png, 'image.png')
    unauthenticated.assertStatus(401)
    assert.lengthOf(await db.from('space_media').where('space_id', spaceId), 0)

    const upload = await client
      .post(`/api/companies/spaces/${spaceId}/media`)
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .file('image', png, 'image.png')
    upload.assertStatus(201)
    const mediaId = upload.body().data.id

    const forbidden = await client
      .post(`/api/admin/space-media/${mediaId}/approve`)
      .withGuard('api')
      .loginAs(owner)
    forbidden.assertStatus(403)
    const media = await db.from('space_media').where('id', mediaId).firstOrFail()
    assert.equal(media.moderation_status, 'pending')
    const events = await db.from('space_media_events').where('space_media_id', mediaId)
    assert.deepEqual(
      events.map((event) => event.action),
      ['uploaded']
    )
  })

  test('enforces tenant ownership, active permissions, and the 20-image limit', async ({
    client,
  }) => {
    const first = await createMediaScenario()
    const second = await createMediaScenario()
    const foreign = await client
      .post(`/api/companies/spaces/${first.spaceId}/media`)
      .withGuard('api')
      .loginAs(second.owner, companyTokenAbilities(second.company))
      .file('image', png, 'x.png')
    foreign.assertStatus(404)
    await db
      .from('company_memberships')
      .where({ company_id: first.company.id, user_id: first.owner.id })
      .update({ status: 'suspended' })
    const suspended = await client
      .post(`/api/companies/spaces/${first.spaceId}/media`)
      .withGuard('api')
      .loginAs(first.owner, companyTokenAbilities(first.company))
      .file('image', png, 'x.png')
    suspended.assertStatus(403)
    await db
      .from('company_memberships')
      .where({ company_id: first.company.id, user_id: first.owner.id })
      .update({ status: 'active' })
    for (let i = 0; i < 20; i++)
      await db.table('space_media').insert({
        space_id: first.spaceId,
        media_type: 'image',
        storage_key: `spaces/${first.company.id}/${first.spaceId}/${i}.png`,
        mime_type: 'image/png',
        byte_size: png.length,
        width: 1,
        height: 1,
        sort_order: i,
        moderation_status: 'pending',
        created_at: new Date('2026-06-15T09:00:00.000Z'),
      })
    const limited = await client
      .post(`/api/companies/spaces/${first.spaceId}/media`)
      .withGuard('api')
      .loginAs(first.owner, companyTokenAbilities(first.company))
      .file('image', png, 'x.png')
    limited.assertStatus(409)
    limited.assertBodyContains({ error: { code: 'SPACE_MEDIA_LIMIT_REACHED' } })
  })

  test('moderation gates public delivery and approved cover selection', async ({ client }) => {
    const { owner, company, spaceId } = await createMediaScenario()
    const admin = await UserFactory.apply('admin', 'verified').create()
    const upload = await client
      .post(`/api/companies/spaces/${spaceId}/media`)
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
      .file('image', png, 'image.png')
    const mediaId = upload.body().data.id
    const hidden = await client.get(`/api/space-media/${mediaId}/content`)
    hidden.assertStatus(404)
    const companyPreview = await client
      .get(`/api/companies/spaces/${spaceId}/media/${mediaId}/content`)
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
    companyPreview.assertStatus(200)
    companyPreview.assertHeader('cache-control', 'private, no-store')
    const adminPreview = await client
      .get(`/api/admin/space-media/${mediaId}/content`)
      .withGuard('api')
      .loginAs(admin)
    adminPreview.assertStatus(200)
    const invalidCover = await client
      .put(`/api/companies/spaces/${spaceId}/media/${mediaId}/cover`)
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
    invalidCover.assertStatus(409)
    const approved = await client
      .post(`/api/admin/space-media/${mediaId}/approve`)
      .withGuard('api')
      .loginAs(admin)
    approved.assertStatus(200)
    await db
      .from('spaces')
      .where('id', spaceId)
      .update({
        publication_status: 'published',
        published_at: new Date('2026-06-15T09:00:00.000Z'),
      })
    await db.from('companies').where('id', company.id).update({ status: 'approved' })
    const cover = await client
      .put(`/api/companies/spaces/${spaceId}/media/${mediaId}/cover`)
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
    cover.assertStatus(200)
    const content = await client.get(`/api/space-media/${mediaId}/content`)
    content.assertStatus(200)
    content.assertHeader('content-type', 'image/png')
    content.assertHeader('x-content-type-options', 'nosniff')
    content.assertHeader('cache-control', 'public, max-age=31536000, immutable')
    const repeat = await client
      .post(`/api/admin/space-media/${mediaId}/approve`)
      .withGuard('api')
      .loginAs(admin)
    repeat.assertStatus(409)
    repeat.assertBodyContains({ error: { code: 'SPACE_MEDIA_STATE_INVALID' } })
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
