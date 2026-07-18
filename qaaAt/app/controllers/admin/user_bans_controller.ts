import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { UserModerationService } from '#services/user_moderation_service'

@inject()
export default class UserBansController {
  constructor(private moderation: UserModerationService) {}

  async store({ params, auth, response }: HttpContext) {
    const user = await this.moderation.ban(Number(params.id), auth.getUserOrFail().id)

    return response.ok({
      message: 'User banned successfully',
      data: {
        id: user.id,
        email: user.email,
        deletedAt: user.deletedAt,
      },
    })
  }

  async destroy({ params, auth, response }: HttpContext) {
    const user = await this.moderation.unban(Number(params.id), auth.getUserOrFail().id)

    return response.ok({
      message: 'User unbanned successfully',
      data: {
        id: user.id,
        email: user.email,
        deletedAt: user.deletedAt,
      },
    })
  }
}
