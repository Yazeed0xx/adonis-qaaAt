import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import AccessDeniedException from '#exceptions/access_denied_exception'
import InvalidCredentialsException from '#exceptions/invalid_credentials_exception'
import { adminLoginValidator } from '#validators/admin_login_validator'

export default class AdminAuthController {
  /**
   * Login admin
   */
  async login({ request, response }: HttpContext) {
    const { email, password } = await request.validateUsing(adminLoginValidator)

    let user: User
    try {
      user = await User.verifyCredentials(email, password)
    } catch {
      throw new InvalidCredentialsException()
    }

    if (user.userType !== 'admin' || user.deletedAt) {
      throw new InvalidCredentialsException()
    }

    // Generate access token
    const token = await User.accessTokens.create(user, ['client:admin_app'])

    return response.ok({
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          userName: user.userName,
          email: user.email,
          userType: user.userType,
        },
        token: {
          type: 'bearer',
          token: token.value!.release(),
        },
      },
    })
  }

  /**
   * Get authenticated admin profile
   */
  async me({ auth, response }: HttpContext) {
    await auth.check()

    const user = auth.getUserOrFail()

    if (user.userType !== 'admin') {
      throw new AccessDeniedException('Access denied. Admin account required.')
    }

    return response.ok({
      data: {
        user: {
          id: user.id,
          userName: user.userName,
          email: user.email,
          userType: user.userType,
        },
      },
    })
  }

  /**
   * Logout admin (revoke current token)
   */
  async logout({ auth, response }: HttpContext) {
    await auth.check()

    const user = auth.getUserOrFail()
    const token = user.currentAccessToken

    if (token) {
      await User.accessTokens.delete(user, token.identifier)
    }

    return response.ok({
      message: 'Logged out successfully',
    })
  }
}
