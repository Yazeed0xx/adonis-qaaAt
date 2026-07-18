import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import UserTransformer from '#transformers/user_transformer'

export default class UsersController {
  async index({ request, serialize }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const users = await User.query()
      .preload('userProfile')
      .where('userType', 'user')
      .whereNull('deletedAt')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return serialize(
      UserTransformer.paginate(users.all(), users.getMeta()).useVariant('forAdminView')
    )
  }

  async show({ params, serialize }: HttpContext) {
    const user = await User.query()
      .where('id', params.id)
      .where('userType', 'user')
      .whereNull('deletedAt')
      .preload('userProfile')
      .firstOrFail()

    return serialize(UserTransformer.transform(user).useVariant('forAdminView'))
  }
}
