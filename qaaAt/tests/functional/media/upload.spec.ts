import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import sharp from 'sharp'
import { createMediaScenario, tinyPng as png } from '#tests/support/scenarios/media'

test.group('Controlled Space media upload', (group) => {
  group.each.setup(withTruncateIsolation)
  group.each.setup(() => {
    drive.fake('private')
    return () => drive.restore('private')
  })

  test('uploads a verified image as private pending media without leaking its key', async ({
    client,
    assert,
  }) => {
    const { owner, membership, spaceId } = await createMediaScenario()
    const response = await client
      .post(`/api/companies/spaces/${spaceId}/media`)
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .field('altTextEn', 'Cover')
      .file('image', png, { filename: '../../escape.png', contentType: 'application/octet-stream' })
    response.assertStatus(201)
    response.assertBodyContains({
      data: {
        spaceId,
        type: 'image',
        moderationStatus: 'pending',
        altTextEn: 'Cover',
        isCover: false,
      },
    })
    assert.notProperty(response.body().data, 'storageKey')
    assert.match(response.body().data.contentUrl, /^\/api\/companies\/spaces\//)
    const row = await db.from('space_media').where('id', response.body().data.id).firstOrFail()
    const space = await db.from('spaces').where('id', spaceId).firstOrFail()
    assert.match(
      row.storage_key,
      new RegExp(`^spaces/${space.company_id}/${spaceId}/[0-9a-f-]+\\.png$`)
    )
    assert.equal(row.mime_type, 'image/png')
    assert.equal(row.moderation_status, 'pending')
  })

  test('persists metadata from decoded JPEG PNG and WebP bytes', async ({ client, assert }) => {
    const { owner, membership, spaceId } = await createMediaScenario()
    const expectedMime = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    } as const
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const bytes = await sharp({
        create: { width: 2, height: 2, channels: 3, background: 'blue' },
      })
        [format]()
        .toBuffer()
      const response = await client
        .post(`/api/companies/spaces/${spaceId}/media`)
        .withGuard('api')
        .loginAs(owner, companyTokenAbilities(membership.companyId))
        .file('image', bytes, {
          filename: `wrong.${format === 'jpeg' ? 'png' : 'jpg'}`,
          contentType: 'application/octet-stream',
        })
      response.assertStatus(201)
      const row = await db.from('space_media').where('id', response.body().data.id).firstOrFail()
      assert.equal(row.mime_type, expectedMime[format])
      assert.equal(Number(row.width), 2)
      assert.equal(Number(row.height), 2)
    }
    const persisted = await db.from('space_media').where('space_id', spaceId)
    assert.lengthOf(persisted, 3)
  })

  test('rejects multiple multipart images without persisting either file', async ({
    client,
    assert,
  }) => {
    const { owner, membership, spaceId } = await createMediaScenario()
    const multiple = await client
      .post(`/api/companies/spaces/${spaceId}/media`)
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
      .file('image', png, 'one.png')
      .file('image', png, 'two.png')
    multiple.assertStatus(422)
    multiple.assertBodyContains({ error: { code: 'SPACE_MEDIA_FILE_REQUIRED' } })
    const count = await db
      .from('space_media')
      .where('space_id', spaceId)
      .count('* as total')
      .first()
    assert.equal(Number(count?.total), 0)
  })

  test('rejects missing, fake, PDF, SVG, and excessive-dimension payloads with stable errors', async ({
    client,
    assert,
  }) => {
    const { owner, membership, spaceId } = await createMediaScenario()
    const send = (bytes: Buffer, filename: string) =>
      client
        .post(`/api/companies/spaces/${spaceId}/media`)
        .withGuard('api')
        .loginAs(owner, companyTokenAbilities(membership.companyId))
        .file('image', bytes, filename)
    const missing = await client
      .post(`/api/companies/spaces/${spaceId}/media`)
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(membership.companyId))
    missing.assertStatus(422)
    missing.assertBodyContains({ error: { code: 'SPACE_MEDIA_FILE_REQUIRED' } })
    for (const [bytes, name] of [
      [Buffer.from('MZ executable'), 'fake.jpg'],
      [Buffer.from('%PDF-1.7'), 'file.pdf'],
      [Buffer.from('<svg/>'), 'file.svg'],
    ] as const) {
      const response = await send(bytes, name)
      response.assertStatus(422)
      response.assertBodyContains({ error: { code: 'SPACE_MEDIA_TYPE_INVALID' } })
    }
    const bomb = Buffer.alloc(45)
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bomb)
    bomb.write('IHDR', 12, 'ascii')
    bomb.writeUInt32BE(12001, 16)
    bomb.writeUInt32BE(12001, 20)
    const invalid = await send(bomb, 'bomb.png')
    invalid.assertStatus(422)
    invalid.assertBodyContains({ error: { code: 'SPACE_MEDIA_IMAGE_INVALID' } })
    const count = await db
      .from('space_media')
      .where('space_id', spaceId)
      .count('* as total')
      .first()
    assert.equal(Number(count?.total), 0)
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
