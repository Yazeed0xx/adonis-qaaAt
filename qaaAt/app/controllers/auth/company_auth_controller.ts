import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Company from '#models/company'
import CompanyProfile from '#models/company_profile'
import AccessDeniedException from '#exceptions/access_denied_exception'
import InvalidCredentialsException from '#exceptions/invalid_credentials_exception'
import { companyRegisterValidator } from '#validators/company_register_validator'
import { companyLoginValidator } from '#validators/company_login_validator'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import drive from '@adonisjs/drive/services/main'

export default class CompanyAuthController {
  /**
   * Register a new company
   */
  async register({ request, response }: HttpContext) {
    const payload = await request.validateUsing(companyRegisterValidator)

    // Upload CR PDF
    const pdfFile = payload.registrationNumberPdf
    const key = `cr_documents/${randomUUID()}.${pdfFile.extname}`
    await pdfFile.moveToDisk(key, 'fs')

    // Use transaction to ensure atomicity
    const trx = await db.transaction()
    let user: User
    let company: Company
    try {
      user = await User.create(
        {
          email: payload.email,
          password: payload.password,
          userName: payload.companyName,
          userType: 'company',
        },
        { client: trx }
      )

      company = await Company.create(
        {
          userId: user.id,
          taxId: payload.taxId || null,
          registrationNumber: payload.registrationNumber,
          registrationNumberPdf: key,
          businessLicense: payload.businessLicense || null,
          contactPerson: payload.contactPerson || null,
          businessAddress: payload.businessAddress,
          city: payload.city,
          status: 'pending',
        },
        { client: trx }
      )

      await CompanyProfile.create(
        {
          userId: user.id,
          companyName: payload.companyName,
          description: payload.description || null,
          logo: payload.logo || null,
          banner: payload.banner || null,
          website: payload.website || null,
          socialLinks: payload.socialLinks || null,
        },
        { client: trx }
      )

      await trx.commit()
    } catch (error) {
      await trx.rollback()
      // Clean up orphaned file on disk
      try {
        await drive.use('fs').delete(key)
      } catch {
        // File cleanup failed — not critical
      }
      throw error
    }

    user = await User.findOrFail(user.id)
    company = await Company.findOrFail(company.id)

    // Generate access token
    const token = await User.accessTokens.create(user)

    return response.created({
      message: 'Company registered successfully. Your account is pending admin approval.',
      data: {
        user: {
          id: user.id,
          email: user.email,
          userType: user.userType,
        },
        company: {
          id: company.id,
          companyName: payload.companyName,
          city: company.city,
          status: company.status,
        },
        token: {
          type: 'bearer',
          token: token.value!.release(),
        },
      },
    })
  }

  /**
   * Login company
   */
  async login({ request, response }: HttpContext) {
    const { email, password } = await request.validateUsing(companyLoginValidator)

    let user: User
    try {
      user = await User.verifyCredentials(email, password)
    } catch {
      throw new InvalidCredentialsException()
    }

    if (user.userType !== 'company' || user.deletedAt) {
      throw new InvalidCredentialsException()
    }

    // Load company and profile
    await user.load('company', (query) => {
      query.preload('companyProfile')
    })

    // Generate access token
    const token = await User.accessTokens.create(user)

    // Build message based on company status
    let message = 'Login successful'
    if (user.company?.status === 'pending') {
      message = 'Login successful. Your company is pending admin approval.'
    } else if (user.company?.status === 'rejected') {
      message = 'Login successful. Your company registration was rejected.'
    } else if (user.company?.status === 'suspended') {
      message = 'Login successful. Your company account is suspended.'
    }

    return response.ok({
      message,
      data: {
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
      throw new AccessDeniedException('Access denied. Company account required.')
    }

    // Load company with profile
    await user.load('company', (query) => {
      query.preload('companyProfile')
    })

    return response.ok({
      data: {
        user: {
          id: user.id,
          email: user.email,
          userType: user.userType,
        },
        company: user.company,
      },
    })
  }

  /**
   * Logout company (revoke current token)
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
