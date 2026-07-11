import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import UserProfile from '#models/user_profile'
import InvalidCredentialsException from '#exceptions/invalid_credentials_exception'
import InvalidInputException from '#exceptions/invalid_input_exception'
import { userRegisterValidator } from '#validators/user_register_validator'
import { userLoginValidator } from '#validators/user_login_validator'
import { verifyEmailValidator } from '#validators/verify_email_validator'
import emailVerificationService from '#services/email_verification_service'
import db from '@adonisjs/lucid/services/db'

export default class UserAuthController {
  /**
   * Register a new user
   */
  async register({ request, response }: HttpContext) {
    const payload = await request.validateUsing(userRegisterValidator)

    // Use transaction to ensure atomicity
    const trx = await db.transaction()
    let user: User
    try {
      user = await User.create(
        {
          userName: payload.userName,
          email: payload.email,
          password: payload.password,
          userType: 'user',
        },
        { client: trx }
      )

      // Create user profile if provided
      if (payload.firstName || payload.lastName || payload.phone || payload.address) {
        await UserProfile.create(
          {
            userId: user.id,
            firstName: payload.firstName || null,
            lastName: payload.lastName || null,
            phone: payload.phone || null,
            address: payload.address || null,
          },
          { client: trx }
        )
      }

      await trx.commit()
    } catch (error) {
      await trx.rollback()
      throw error
    }

    user = await User.findOrFail(user.id)

    // Send verification email (non-blocking — don't fail registration if mail fails)
    try {
      await emailVerificationService.sendVerificationEmail(user)
    } catch {
      // Mail transport failed — user can request resend later via /resend-verification
    }

    // Generate access token
    const token = await User.accessTokens.create(user, ['client:customer_app'])

    return response.created({
      message: 'User registered successfully. Please check your email for your verification code.',
      data: {
        user: {
          id: user.id,
          userName: user.userName,
          email: user.email,
          userType: user.userType,
          emailVerified: false,
        },
        token: {
          type: 'bearer',
          token: token.value!.release(),
        },
      },
    })
  }

  /**
   * Login user
   */
  async login({ request, response }: HttpContext) {
    const { email, password } = await request.validateUsing(userLoginValidator)

    let user: User
    try {
      user = await User.verifyCredentials(email, password)
    } catch {
      throw new InvalidCredentialsException()
    }

    if (user.userType !== 'user' || user.deletedAt) {
      throw new InvalidCredentialsException()
    }

    // Generate access token
    const token = await User.accessTokens.create(user, ['client:customer_app'])

    return response.ok({
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          userName: user.userName,
          email: user.email,
          userType: user.userType,
          emailVerified: user.isEmailVerified,
        },
        token: {
          type: 'bearer',
          token: token.value!.release(),
        },
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
      data: {
        user: {
          id: user.id,
          userName: user.userName,
          email: user.email,
          userType: user.userType,
          emailVerified: user.isEmailVerified,
          profile: user.userProfile,
        },
      },
    })
  }

  /**
   * Verify email address with OTP code
   */
  async verifyEmail({ request, response }: HttpContext) {
    const { email, code } = await request.validateUsing(verifyEmailValidator)

    const user = await emailVerificationService.verifyEmail(email, code)

    return response.ok({
      message: 'Email verified successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          emailVerified: true,
        },
      },
    })
  }

  /**
   * Resend verification email
   */
  async resendVerification({ request, response }: HttpContext) {
    const { email } = request.only(['email'])

    if (!email) {
      throw new InvalidInputException('Email address is required', 'EMAIL_REQUIRED')
    }

    await emailVerificationService.resendVerification(email)

    return response.ok({
      message:
        'If an account with that email exists and is not verified, a verification code has been sent.',
    })
  }

  /**
   * Logout user (revoke current token)
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
