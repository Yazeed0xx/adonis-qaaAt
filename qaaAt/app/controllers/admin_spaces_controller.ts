import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { SpaceModerationService } from '#services/space_moderation_service'
import { moderationReasonValidator } from '#validators/space_validator'

@inject()
export default class AdminSpacesController {
  constructor(private moderation: SpaceModerationService) {}
  async index({ request, response }: HttpContext) {
    const spaces = await this.moderation.list(
      request.input('status'),
      Number(request.input('page', 1)),
      Math.min(100, Number(request.input('limit', 20)))
    )
    return response.ok({
      data: spaces.all().map((space) => this.serialize(space)),
      metadata: spaces.getMeta(),
    })
  }
  async pending({ request, response }: HttpContext) {
    const spaces = await this.moderation.list(
      'pending_review',
      Number(request.input('page', 1)),
      Math.min(100, Number(request.input('limit', 20)))
    )
    return response.ok({
      data: spaces.all().map((space) => this.serialize(space)),
      metadata: spaces.getMeta(),
    })
  }
  async show({ params, response }: HttpContext) {
    return response.ok({ data: this.serialize(await this.moderation.show(Number(params.id))) })
  }
  async publish({ auth, params, response }: HttpContext) {
    const space = await this.moderation.publish(Number(params.id), auth.getUserOrFail().id)
    return response.ok({ data: this.serialize(space) })
  }
  async requestChanges({ auth, params, request, response }: HttpContext) {
    const { reason } = await request.validateUsing(moderationReasonValidator)
    const space = await this.moderation.requestChanges(
      Number(params.id),
      auth.getUserOrFail().id,
      reason
    )
    return response.ok({ data: this.serialize(space) })
  }
  async suspend({ auth, params, request, response }: HttpContext) {
    const { reason } = await request.validateUsing(moderationReasonValidator)
    const space = await this.moderation.suspend(Number(params.id), auth.getUserOrFail().id, reason)
    return response.ok({ data: this.serialize(space) })
  }
  private serialize(space: any) {
    return {
      id: space.id,
      companyId: space.companyId,
      name: space.nameAr ?? space.nameEn ?? space.legacyName,
      category: space.category?.slug,
      publicationStatus: space.publicationStatus,
      legacyHallId: space.legacyHallId,
      createdAt: space.createdAt,
      updatedAt: space.updatedAt,
    }
  }
}
