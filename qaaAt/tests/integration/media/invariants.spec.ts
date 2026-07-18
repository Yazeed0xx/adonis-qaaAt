import { Readable } from 'node:stream'
import { test } from '@japa/runner'
import drive from '@adonisjs/drive/services/main'
import db from '@adonisjs/lucid/services/db'
import { SpaceMediaService } from '#services/space_media_service'
import { SpaceMediaStorageService } from '#services/space_media_storage_service'
import { withTruncateIsolation } from '#tests/support/database'
import { createMediaScenario, tinyPng } from '#tests/support/scenarios/media'

class FakeMediaStorage extends SpaceMediaStorageService {
  readonly objects = new Set<string>()
  deleteCalls = 0
  failDeletes = false
  #keySequence = 0

  override key(companyId: number, spaceId: number, extension: string) {
    return `spaces/${companyId}/${spaceId}/fixture-${++this.#keySequence}.${extension}`
  }

  override async put(key: string) {
    this.objects.add(key)
  }

  override async exists(key: string) {
    return this.objects.has(key)
  }

  override async stream() {
    return Readable.from([])
  }

  override async delete(key: string) {
    this.deleteCalls++
    if (this.failDeletes) throw new Error('storage unavailable')
    this.objects.delete(key)
  }
}

test.group('Space media database invariants', (group) => {
  group.each.setup(withTruncateIsolation)
  group.each.setup(() => {
    drive.fake('private')
    return () => drive.restore('private')
  })

  test('concurrent uploads and cover changes preserve the 20-image and single-cover invariants', async ({
    assert,
  }) => {
    const { owner, company, spaceId } = await createMediaScenario()
    const service = new SpaceMediaService()
    const uploads = await Promise.allSettled(
      Array.from({ length: 24 }, () => service.upload(company.id, spaceId, owner.id, tinyPng, {}))
    )
    const failures = uploads.filter((result) => result.status === 'rejected')
    assert.equal(uploads.filter((result) => result.status === 'fulfilled').length, 20)
    assert.equal(failures.length, 4)
    assert.isTrue(
      failures.every(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof Error &&
          result.reason.message.includes('at most 20')
      )
    )
    const activeMedia = await db
      .from('space_media')
      .where('space_id', spaceId)
      .whereNull('deleted_at')
      .count('* as total')
      .firstOrFail()
    assert.equal(Number(activeMedia.total), 20)

    const rows = await db.from('space_media').where('space_id', spaceId).orderBy('id')
    await db
      .from('space_media')
      .whereIn('id', [rows[0].id, rows[1].id])
      .update({ moderation_status: 'approved' })
    const covers = await Promise.allSettled([
      service.cover(company.id, spaceId, rows[0].id, owner.id),
      service.cover(company.id, spaceId, rows[1].id, owner.id),
    ])
    assert.equal(covers.filter((result) => result.status === 'fulfilled').length, 2)
    const selectedCovers = await db
      .from('space_media')
      .where({ space_id: spaceId, is_cover: true })
      .whereNull('deleted_at')
    assert.equal(selectedCovers.length, 1)

    await assert.rejects(
      () => service.reorder(company.id, spaceId, owner.id, [rows[0].id]),
      /every controlled media ID exactly once/
    )
    await assert.rejects(
      () =>
        service.reorder(
          company.id,
          spaceId,
          owner.id,
          rows.map(() => rows[0].id)
        ),
      /every controlled media ID exactly once/
    )
  }).timeout(30_000)

  test('soft deletion commits its audit and cleanup intent before idempotent physical cleanup', async ({
    assert,
  }) => {
    const { owner, company, spaceId } = await createMediaScenario()
    const storage = new FakeMediaStorage()
    const service = new SpaceMediaService(storage)
    const media = await service.upload(company.id, spaceId, owner.id, tinyPng, {})

    await assert.rejects(() => service.delete(company.id + 999, spaceId, media.id, owner.id, false))
    const visibleAfterFailure = await db.from('space_media').where('id', media.id).firstOrFail()
    assert.isNull(visibleAfterFailure.deleted_at)
    assert.lengthOf(await db.from('space_media_cleanup_outbox'), 0)
    assert.lengthOf(
      await db.from('space_media_events').where({ space_media_id: media.id, action: 'deleted' }),
      0
    )

    await service.delete(company.id, spaceId, media.id, owner.id, false)
    const pending = await db
      .from('space_media_cleanup_outbox')
      .where('space_media_id', media.id)
      .firstOrFail()
    assert.isNull(pending.processed_at)
    assert.isTrue(storage.objects.has(pending.storage_key))
    await Promise.all([service.processCleanup(), service.processCleanup()])
    const processed = await db
      .from('space_media_cleanup_outbox')
      .where('id', pending.id)
      .firstOrFail()
    assert.isNotNull(processed.processed_at)
    assert.equal(storage.deleteCalls, 1)
    await service.processCleanup()
    assert.equal(storage.deleteCalls, 1)

    const second = await service.upload(company.id, spaceId, owner.id, tinyPng, {})
    await service.delete(company.id, spaceId, second.id, owner.id, false)
    storage.failDeletes = true
    await service.processCleanup()
    const failed = await db
      .from('space_media_cleanup_outbox')
      .where('space_media_id', second.id)
      .firstOrFail()
    assert.equal(failed.attempts, 1)
    assert.isNull(failed.processed_at)
    assert.include(failed.last_error, 'storage unavailable')
  })
})
