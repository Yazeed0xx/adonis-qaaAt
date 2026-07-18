import sharp from 'sharp'
import SpaceMediaException from '#exceptions/space_media_exception'

export type VerifiedImage = {
  mime: 'image/jpeg' | 'image/png' | 'image/webp'
  extension: 'jpg' | 'png' | 'webp'
  width: number
  height: number
}

const MAX_DIMENSION = 12_000
const MAX_PIXELS = 40_000_000
const formats = {
  jpeg: { mime: 'image/jpeg', extension: 'jpg' },
  png: { mime: 'image/png', extension: 'png' },
  webp: { mime: 'image/webp', extension: 'webp' },
} as const

const invalid = () =>
  new SpaceMediaException(
    'The uploaded image is malformed, animated, or unsafe',
    'SPACE_MEDIA_IMAGE_INVALID'
  )

export class VerifiedImageService {
  async verify(bytes: Uint8Array): Promise<VerifiedImage> {
    if (!bytes.length) throw invalid()
    const buffer = Buffer.from(bytes)
    const hasSupportedSignature =
      (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
      (buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP')
    if (!hasSupportedSignature)
      throw new SpaceMediaException(
        'Only verified JPEG, PNG, and WebP images are supported',
        'SPACE_MEDIA_TYPE_INVALID'
      )
    try {
      const image = sharp(buffer, {
        animated: true,
        failOn: 'error',
        limitInputPixels: MAX_PIXELS,
        sequentialRead: true,
      })
      const metadata = await image.metadata()
      const format = metadata.format && formats[metadata.format as keyof typeof formats]
      if (!format) {
        throw new SpaceMediaException(
          'Only verified JPEG, PNG, and WebP images are supported',
          'SPACE_MEDIA_TYPE_INVALID'
        )
      }
      const width = metadata.width
      const height = metadata.height
      const pages = metadata.pages ?? 1
      if (
        !width ||
        !height ||
        pages !== 1 ||
        width > MAX_DIMENSION ||
        height > MAX_DIMENSION ||
        width * height > MAX_PIXELS
      ) {
        throw invalid()
      }

      // stats performs a complete decode without transforming or recompressing the original.
      await image.stats()
      return { ...format, width, height }
    } catch (error) {
      if (error instanceof SpaceMediaException) throw error
      throw invalid()
    }
  }
}
