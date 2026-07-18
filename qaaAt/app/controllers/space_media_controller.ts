import { readFile } from 'node:fs/promises'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import companyContextService from '#services/company_context_service'
import SpaceMediaException from '#exceptions/space_media_exception'
import { SpaceMediaService } from '#services/space_media_service'
import { serializeSpaceMedia } from '#transformers/space_media_transformer'
import { spaceMediaAltValidator, spaceMediaOrderValidator } from '#validators/space_media_validator'

@inject()
export default class SpaceMediaController {
  constructor(private media: SpaceMediaService) {}
  async store({ auth, companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    const files = request.files('image', { size: '10mb' })
    if (files.length !== 1)
      throw new SpaceMediaException(
        'Exactly one image file is required',
        'SPACE_MEDIA_FILE_REQUIRED',
        422
      )
    const file = files[0]
    if (!file.isValid) {
      if (file.errors.some((e) => e.type === 'size'))
        throw new SpaceMediaException('Image exceeds the 10 MB limit', 'SPACE_MEDIA_TOO_LARGE', 413)
      throw new SpaceMediaException(
        'The uploaded image is invalid',
        'SPACE_MEDIA_IMAGE_INVALID',
        422
      )
    }
    if (!file.tmpPath)
      throw new SpaceMediaException(
        'Exactly one image file is required',
        'SPACE_MEDIA_FILE_REQUIRED',
        422
      )
    const alt = await request.validateUsing(spaceMediaAltValidator)
    const row = await this.media.upload(
      companyContext.companyId,
      Number(params.spaceId),
      auth.getUserOrFail().id,
      await readFile(file.tmpPath),
      alt
    )
    return response.created({ data: serializeSpaceMedia(row, true) })
  }
  async index({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.view')
    const rows = await this.media.list(companyContext.companyId, Number(params.spaceId))
    return response.ok({
      data: rows.map((r) => serializeSpaceMedia(r, true)),
    })
  }
  async update({ auth, companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    const row = await this.media.update(
      companyContext.companyId,
      Number(params.spaceId),
      Number(params.mediaId),
      auth.getUserOrFail().id,
      await request.validateUsing(spaceMediaAltValidator)
    )
    return response.ok({ data: serializeSpaceMedia(row, true) })
  }
  async order({ auth, companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    const { mediaIds } = await request.validateUsing(spaceMediaOrderValidator)
    const rows = await this.media.reorder(
      companyContext.companyId,
      Number(params.spaceId),
      auth.getUserOrFail().id,
      mediaIds
    )
    return response.ok({
      data: rows.map((r) => serializeSpaceMedia(r, true)),
    })
  }
  async cover({ auth, companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    return response.ok({
      data: serializeSpaceMedia(
        await this.media.cover(
          companyContext.companyId,
          Number(params.spaceId),
          Number(params.mediaId),
          auth.getUserOrFail().id
        ),
        true
      ),
    })
  }
  async destroy({ auth, companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.manage')
    await this.media.delete(
      companyContext.companyId,
      Number(params.spaceId),
      Number(params.mediaId),
      auth.getUserOrFail().id
    )
    return response.noContent()
  }
  async content({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'spaces.view')
    const { row, stream } = await this.media.companyContent(
      companyContext.companyId,
      Number(params.spaceId),
      Number(params.mediaId)
    )
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
