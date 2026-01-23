import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Company from '#models/company'
import CompanyProfile from '#models/company_profile'
import { companyRegisterValidator } from '#validators/company_register_validator'
import { companyLoginValidator } from '#validators/company_login_validator'

export default class CompanyAuthController {
  /**
   * Register a new company
   */
  async register({ request, response }: HttpContext) {
    const payload = await request.validateUsing(companyRegisterValidator)

    // Create user with company type
    const user = await User.create({
      email: payload.email,
      password: payload.password,
      userType: 'company',
    })

    // Create company record
    const company = await Company.create({
      userId: user.id,
      taxId: payload.taxId || null,
      registrationNumber: payload.registrationNumber || null,
      registrationNumberPdf: payload.registrationNumberPdf || null,
      businessLicense: payload.businessLicense || null,
      contactPerson: payload.contactPerson || null,
      businessAddress: payload.businessAddress || null,
      city: payload.city,
    })

    // Create company profile
    await CompanyProfile.create({
      userId: user.id,
      companyName: payload.companyName,
      description: payload.description || null,
      logo: payload.logo || null,
      banner: payload.banner || null,
      website: payload.website || null,
      socialLinks: payload.socialLinks || null,
    })

    // Generate access token
    const token = await User.accessTokens.create(user)

    return response.created({
      message: 'Company registered successfully',
      user: {
        id: user.id,
        email: user.email,
        userType: user.userType,
      },
      company: {
        id: company.id,
        companyName: payload.companyName,
        city: company.city,
      },
      token: {
        type: 'bearer',
        token: token.value!.release(),
      },
    })
  }

  /**
   * Login company
   */
  async login({ request, response }: HttpContext) {
    const { email, password } = await request.validateUsing(companyLoginValidator)

    // Find user by email and user type
    const user = await User.findBy('email', email)

    if (!user || user.userType !== 'company') {
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

    // Load company and profile
    await user.load('company', (query) => {
      query.preload('companyProfile')
    })

    // Generate access token
    const token = await User.accessTokens.create(user)

    return response.ok({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        userType: user.userType,
      },
      company: user.company,
      token: {
        type: 'bearer',
        token: token.value!.release(),
      },
    })
  }

  /**
   * Get authenticated company profile
   */
  async me({ auth, response }: HttpContext) {
    await auth.check()

    const user = auth.getUserOrFail()

    if (user.userType !== 'company') {
      return response.forbidden({
        message: 'Access denied. Company account required.',
      })
    }

    // Load company with profile
    await user.load('company', (query) => {
      query.preload('companyProfile')
    })

    return response.ok({
      user: {
        id: user.id,
        email: user.email,
        userType: user.userType,
      },
      company: user.company,
    })
  }

  /**
   * Logout company (revoke current token)
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
