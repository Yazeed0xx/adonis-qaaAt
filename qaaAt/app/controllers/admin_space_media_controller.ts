import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { SpaceMediaService } from '#services/space_media_service'
import { serializeModerationMedia } from '#transformers/space_media_transformer'
import { spaceMediaRejectValidator } from '#validators/space_media_validator'

@inject()
export default class AdminSpaceMediaController {
  constructor(private media: SpaceMediaService) {}
  async pending({ request, response }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)))
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20))))
    const rows = await this.media.pending(page, limit)
    return response.ok({ data: rows.all().map(serializeModerationMedia), metadata: rows.getMeta() })
  }
  async show({ params, response }: HttpContext) {
    return response.ok({
      data: serializeModerationMedia(await this.media.adminShow(Number(params.mediaId))),
    })
  }
  async approve({ auth, params, response }: HttpContext) {
    return response.ok({
      data: serializeModerationMedia(
        await this.media.moderate(Number(params.mediaId), auth.getUserOrFail().id, 'approved')
      ),
    })
  }
  async reject({ auth, params, request, response }: HttpContext) {
    const { reason } = await request.validateUsing(spaceMediaRejectValidator)
    return response.ok({
      data: serializeModerationMedia(
        await this.media.moderate(
          Number(params.mediaId),
          auth.getUserOrFail().id,
          'rejected',
          reason
        )
      ),
    })
  }
  async content({ params, response }: HttpContext) {
    const { row, stream } = await this.media.adminContent(Number(params.mediaId))
    response.header('Content-Type', row.mime_type)
    response.header(
      'Content-Disposition',
      `inline; filename="space-media-${row.id}.${row.mime_type === 'image/jpeg' ? 'jpg' : row.mime_type.split('/')[1]}"`
    )
    response.header('X-Content-Type-Options', 'nosniff')
    response.header('Cache-Control', 'private, no-store')
    return response.stream(stream)
  }
}
