import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Company from '#models/company'
import CompanyProfile from '#models/company_profile'
import InvalidCredentialsException from '#exceptions/invalid_credentials_exception'
import { companyRegisterValidator } from '#validators/company_register_validator'
import { companyLoginValidator } from '#validators/company_login_validator'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import drive from '@adonisjs/drive/services/main'
import pdfSecurityService from '#services/pdf_security_service'
import CompanyMembership from '#models/company_membership'
import {
  resolvePermissions,
  type CompanyPermission,
  type CompanyRole,
} from '#lib/company_permissions'
import CompanyTransformer from '#transformers/company_transformer'

export default class CompanyAuthController {
  /**
   * Register a new company
   */
  async register({ request, response }: HttpContext) {
    const payload = await request.validateUsing(companyRegisterValidator)

    // Upload CR PDF
    const pdfFile = payload.registrationNumberPdf
    await pdfSecurityService.validateAndScan(pdfFile)
    const key = `cr_documents/${randomUUID()}.pdf`
    await pdfFile.moveToDisk(key, 'private')

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

      await CompanyMembership.create(
        {
          companyId: company.id,
          userId: user.id,
          role: 'owner',
          status: 'active',
          joinedAt: company.createdAt,
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
        await drive.use('private').delete(key)
      } catch {
        // File cleanup failed — not critical
      }
      throw error
    }

    user = await User.findOrFail(user.id)
    company = await Company.findOrFail(company.id)

    // Generate access token
    const token = await User.accessTokens.create(user, [
      'client:company_app',
      `company:${company.id}`,
    ])

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
  async login({ request, response, serialize }: HttpContext) {
    const { email, password } = await request.validateUsing(companyLoginValidator)

    let user: User
    try {
      user = await User.verifyCredentials(email, password)
    } catch {
      throw new InvalidCredentialsException()
    }

    if (user.deletedAt) {
      throw new InvalidCredentialsException()
    }

    const membership = await CompanyMembership.query()
      .where('userId', user.id)
      .where('status', 'active')
      .whereHas('company', (query) => query.whereNull('deletedAt').whereNot('status', 'suspended'))
      .preload('company', (query) => query.preload('companyProfile'))
      .preload('permissionOverrides')
      .first()
    if (!membership) {
      throw new InvalidCredentialsException()
    }

    const token = await User.accessTokens.create(user, [
      'client:company_app',
      `company:${membership.companyId}`,
    ])

    // Build message based on company status
    let message = 'Login successful'
    if (membership.company.status === 'pending') {
      message = 'Login successful. Your company is pending admin approval.'
    } else if (membership.company.status === 'rejected') {
      message = 'Login successful. Your company registration was rejected.'
    }

    return response.ok({
      message,
      data: {
        user: {
          id: user.id,
          email: user.email,
          userType: user.userType,
        },
        company: await serialize.withoutWrapping(CompanyTransformer.transform(membership.company)),
        membership: this.serializeMembership(membership),
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
  async me({ auth, companyContext, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const { membership, company } = companyContext
    await company.load('companyProfile')

    return response.ok({
      data: {
        user: {
          id: user.id,
          email: user.email,
          userType: user.userType,
        },
        company: await serialize.withoutWrapping(CompanyTransformer.transform(company)),
        membership: this.serializeMembership(membership),
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

  private serializeMembership(membership: CompanyMembership) {
    const overrides = membership.permissionOverrides.map((item) => ({
      permission: item.permission as CompanyPermission,
      effect: item.effect as 'allow' | 'deny',
    }))
    return {
      id: membership.id,
      companyId: membership.companyId,
      role: membership.role,
      status: membership.status,
      permissions: resolvePermissions(membership.role as CompanyRole, overrides),
    }
  }
}
