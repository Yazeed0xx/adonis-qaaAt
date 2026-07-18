import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import drive from '@adonisjs/drive/services/main'
import db from '@adonisjs/lucid/services/db'
import { createAdmin } from '#tests/support/actors'
import { createMediaScenario, tinyPng } from '#tests/support/scenarios/media'

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
    throw new Error('Expected a single media response containing a numeric data.id')
  }
  return body.data.id
}

test.group('Controlled Space media management', (group) => {
  group.each.setup(withTruncateIsolation)
  group.each.setup(() => {
    drive.fake('private')
    return () => drive.restore('private')
  })

  test('an owner updates, lists, reorders, selects, and deletes approved media atomically', async ({
    client,
    assert,
  }) => {
    const { owner, membership, spaceId } = await createMediaScenario()
    const admin = await createAdmin()
    const upload = async (name: string) => {
      const response = await client
        .visit('space_media.store', { spaceId })
        .withGuard('api')
        .loginAs(owner, companyTokenAbilities(membership.companyId))
        .file('image', tinyPng, name)
      response.assertStatus(201)
      return resourceId(response.body())
    }
    const firstId = await upload('first.png')
    const secondId = await upload('second.png')

    for (const mediaId of [firstId, secondId]) {
      const approved = await client
        .visit('admin_space_media.approve', { mediaId })
        .withGuard('api')
        .loginAs(admin)
      approved.assertStatus(200)
    }

    const updated = await client
      .visit('space_media.update', { spaceId, mediaId: firstId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .json({ altTextAr: 'الصورة الأولى', altTextEn: 'First image' })
    updated.assertStatus(200)
    updated.assertBodyContains({ data: { id: firstId, altTextEn: 'First image' } })

    const ordered = await client
      .visit('space_media.order', { spaceId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .json({ mediaIds: [secondId, firstId] })
    ordered.assertStatus(200)
    ordered.assertBodyContains({
      data: [
        { id: secondId, sortOrder: 0 },
        { id: firstId, sortOrder: 1 },
      ],
    })

    const cover = await client
      .visit('space_media.cover', { spaceId, mediaId: firstId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
    cover.assertStatus(200)
    cover.assertBodyContains({ data: { id: firstId, isCover: true } })

    const listed = await client
      .visit('space_media.index', { spaceId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
    listed.assertStatus(200)
    listed.assertBodyContains({
      data: [
        { id: secondId, sortOrder: 0 },
        { id: firstId, sortOrder: 1, isCover: true },
      ],
    })

    const removed = await client
      .visit('space_media.destroy', { spaceId, mediaId: firstId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
    removed.assertStatus(204)
    const rows = await db.from('space_media').where('space_id', spaceId).orderBy('sort_order')
    assert.isNotNull(rows.find((row) => row.id === firstId)?.deleted_at)
    assert.isTrue(rows.find((row) => row.id === secondId)?.is_cover)
    const events = await db
      .from('space_media_events')
      .where('space_media_id', firstId)
      .orderBy('id')
    assert.deepEqual(
      events.map((event) => event.action),
      ['uploaded', 'approved', 'metadata_updated', 'reordered', 'cover_selected', 'deleted']
    )
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
