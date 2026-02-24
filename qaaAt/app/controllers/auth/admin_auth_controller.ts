import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import { adminLoginValidator } from '#validators/admin_login_validator'

export default class AdminAuthController {
  /**
   * Login admin
   */
  async login({ request, response }: HttpContext) {
    const { email, password } = await request.validateUsing(adminLoginValidator)

    // Find user by email and user type
    const user = await User.query().where('email', email).whereNull('deletedAt').first()

    if (!user || user.userType !== 'admin') {
      return response.unauthorized({
        message: 'Invalid credentials',
      })
    }

    // Verify password
    try {
      await User.verifyCredentials(email, password)
    } catch {
      return response.unauthorized({
        message: 'Invalid credentials',
      })
    }

    // Generate access token
    const token = await User.accessTokens.create(user)

    return response.ok({
      message: 'Login successful',
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
    })
  }

  /**
   * Get authenticated admin profile
   */
  async me({ auth, response }: HttpContext) {
    await auth.check()

    const user = auth.getUserOrFail()

    if (user.userType !== 'admin') {
      return response.forbidden({
        message: 'Access denied. Admin account required.',
      })
    }

    return response.ok({
      user: {
        id: user.id,
        userName: user.userName,
        email: user.email,
        userType: user.userType,
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
