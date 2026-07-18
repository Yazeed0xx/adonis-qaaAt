import { test } from '@japa/runner'
import sharp from 'sharp'
import { VerifiedImageService } from '#services/verified_image_service'

const verifier = new VerifiedImageService()

async function realFixture(format: 'jpeg' | 'png' | 'webp', width = 3, height = 2) {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 80, b: 160 } },
  })
  return image[format]().toBuffer()
}

test.group('VerifiedImageService with Sharp decoding', () => {
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    test(`fully decodes a real ${format.toUpperCase()} fixture`, async ({ assert }) => {
      const result = await verifier.verify(await realFixture(format))
      assert.deepEqual(result, {
        mime: `image/${format}`,
        extension: format === 'jpeg' ? 'jpg' : format,
        width: 3,
        height: 2,
      })
    })
  }

  test('rejects truncated signature/header-only images and corrupt content', async ({ assert }) => {
    const valid = {
      png: await realFixture('png'),
      jpeg: await realFixture('jpeg'),
      webp: await realFixture('webp'),
    }
    for (const bytes of [
      valid.png.subarray(0, 33),
      valid.jpeg.subarray(0, 24),
      valid.webp.subarray(0, 30),
      Buffer.concat([valid.png.subarray(0, 8), Buffer.from('corrupt image')]),
    ]) {
      await assert.rejects(() => verifier.verify(bytes), /malformed, animated, or unsafe/)
    }
  })

  test('rejects a real animated WebP fixture', async ({ assert }) => {
    const singleFrameAnimation = Buffer.from(
      'UklGRlIAAABXRUJQVlA4WAoAAAASAAAAAAAAAAAAQU5JTQYAAAD/////AABBTk1GJgAAAAAAAAAAAAAAAAAAAGQAAABWUDhMDQAAAC8AAAAQBxAREYiI/gcA',
      'base64'
    )
    const frameOffset = singleFrameAnimation.indexOf('ANMF')
    const frameLength = singleFrameAnimation.readUInt32LE(frameOffset + 4)
    const chunkLength = 8 + frameLength + (frameLength % 2)
    const animated = Buffer.concat([
      singleFrameAnimation,
      singleFrameAnimation.subarray(frameOffset, frameOffset + chunkLength),
    ])
    animated.writeUInt32LE(animated.length - 8, 4)
    const metadata = await sharp(animated, { animated: true }).metadata()
    assert.isAbove(metadata.pages ?? 0, 1)
    await assert.rejects(() => verifier.verify(animated), /malformed, animated, or unsafe/)
  })

  test('rejects excessive dimensions and decoded pixel count', async ({ assert }) => {
    const tooWide = await realFixture('png', 12_001, 1)
    const tooManyPixels = await realFixture('png', 8_000, 5_001)
    await assert.rejects(() => verifier.verify(tooWide), /malformed, animated, or unsafe/)
    await assert.rejects(() => verifier.verify(tooManyPixels), /malformed, animated, or unsafe/)
  })

  test('rejects empty, PDF, SVG, and executable content', async ({ assert }) => {
    for (const bytes of [
      Buffer.alloc(0),
      Buffer.from('%PDF-1.7'),
      Buffer.from('<svg/>'),
      Buffer.from('MZ executable'),
    ]) {
      await assert.rejects(() => verifier.verify(bytes))
    }
  })
})
