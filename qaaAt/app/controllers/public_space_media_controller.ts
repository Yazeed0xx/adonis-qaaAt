import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { SpaceMediaService } from '#services/space_media_service'

@inject()
export default class PublicSpaceMediaController {
  constructor(private media: SpaceMediaService) {}
  async content({ params, response }: HttpContext) {
    const { row, stream } = await this.media.publicContent(Number(params.mediaId))
    response.header('Content-Type', row.mime_type)
    response.header(
      'Content-Disposition',
      `inline; filename="space-media-${row.id}.${row.mime_type === 'image/jpeg' ? 'jpg' : row.mime_type.split('/')[1]}"`
    )
    response.header('X-Content-Type-Options', 'nosniff')
    response.header('Cache-Control', 'public, max-age=31536000, immutable')
    response.header('ETag', `"space-media-${row.id}-${row.byte_size}"`)
    return response.stream(stream)
  }
}
