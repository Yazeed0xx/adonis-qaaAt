import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import { UserFactory } from '#database/factories/user_factory'
import { createMediaScenario, tinyPng as png } from '#tests/support/scenarios/media'

test.group('Controlled Space media moderation', (group) => {
  group.each.setup(withTruncateIsolation)
  group.each.setup(() => {
    drive.fake('private')
    return () => drive.restore('private')
  })

  test('requires a rejection reason and audits successful transitions only', async ({
    client,
    assert,
  }) => {
    const { owner, membership, spaceId } = await createMediaScenario()
    const admin = await UserFactory.apply('admin', 'verified').create()
    const upload = await client
      .post(`/api/companies/spaces/${spaceId}/media`)
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .file('image', png, 'image.png')
    const mediaId = upload.body().data.id
    const missing = await client
      .post(`/api/admin/space-media/${mediaId}/reject`)
      .withGuard('api')
      .loginAs(admin)
      .json({ reason: ' ' })
    missing.assertStatus(422)
    const uploadEvents = await db.from('space_media_events').where('space_media_id', mediaId)
    assert.equal(uploadEvents.length, 1)
    const rejected = await client
      .post(`/api/admin/space-media/${mediaId}/reject`)
      .withGuard('api')
      .loginAs(admin)
      .json({ reason: 'Poor quality' })
    rejected.assertStatus(200)
    const events = await db
      .from('space_media_events')
      .where('space_media_id', mediaId)
      .orderBy('id')
    assert.deepEqual(
      events.map((e) => e.action),
      ['uploaded', 'rejected']
    )
    const hidden = await client.get(`/api/space-media/${mediaId}/content`)
    hidden.assertStatus(404)
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
