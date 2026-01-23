import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import UserProfile from '#models/user_profile'
import { userRegisterValidator } from '#validators/user_register_validator'
import { userLoginValidator } from '#validators/user_login_validator'

export default class UserAuthController {
  /**
   * Register a new user
   */
  async register({ request, response }: HttpContext) {
    const payload = await request.validateUsing(userRegisterValidator)

    // Create user
    const user = await User.create({
      userName: payload.userName || null,
      email: payload.email,
      password: payload.password,
      userType: 'user',
    })

    // Create user profile if provided
    if (payload.firstName || payload.lastName || payload.phone || payload.address) {
      await UserProfile.create({
        userId: user.id,
        firstName: payload.firstName || null,
        lastName: payload.lastName || null,
        phone: payload.phone || null,
        address: payload.address || null,
      })
    }

    // Generate access token
    const token = await User.accessTokens.create(user)

    return response.created({
      message: 'User registered successfully',
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
   * Login user
   */
  async login({ request, response }: HttpContext) {
    const { email, password } = await request.validateUsing(userLoginValidator)

    // Find user by email and user type
    const user = await User.findBy('email', email)

    if (!user || user.userType !== 'user') {
      return response.unauthorized({
        message: 'Invalid credentials',
      })
    }

    // Verify password
    const isPasswordValid = await User.verifyCredentials(email, password)

    if (!isPasswordValid) {
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
   * Get authenticated user profile
   */
  async me({ auth, response }: HttpContext) {
    await auth.check()

    const user = auth.getUserOrFail()

    // Load user profile
    await user.load('userProfile')

    return response.ok({
      user: {
        id: user.id,
        userName: user.userName,
        email: user.email,
        userType: user.userType,
        profile: user.userProfile,
      },
    })
  }

  /**
   * Logout user (revoke current token)
   */
  async logout({ auth, response }: HttpContext) {
    await auth.check()

    const user = auth.getUserOrFail()
    const token = auth.user!.currentAccessToken

    if (token) {
      await User.accessTokens.delete(user, token.identifier)
    }

    return response.ok({
      message: 'Logged out successfully',
    })
  }
}
