import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Company from '#models/company'
import Hall from '#models/hall'
import Booking from '#models/booking'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import notificationService from '#services/notification_service'

export default class AdminController {
  /**
   * Get all users
   */
  async getUsers({ request, response }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const users = await User.query()
      .preload('userProfile')
      .where('userType', 'user')
      .whereNull('deletedAt')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return response.ok(users)
  }

  /**
   * Get all companies
   */
  async getCompanies({ request, response }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const companies = await Company.query()
      .preload('user')
      .preload('companyProfile')
      .whereNull('deletedAt')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return response.ok(companies)
  }

  /**
   * Get all halls
   */
  async getHalls({ request, response }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const halls = await Hall.query()
      .preload('company')
      .whereNull('deletedAt')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return response.ok(halls)
  }

  /**
   * Get all bookings
   */
  async getBookings({ request, response }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const bookings = await Booking.query()
      .preload('user')
      .preload('hall')
      .preload('services')
      .whereNull('deletedAt')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return response.ok(bookings)
  }

  /**
   * Ban a user (soft delete)
   */
  async banUser({ params, response }: HttpContext) {
    const user = await User.findOrFail(params.id)

    if (user.userType === 'admin') {
      return response.forbidden({
        message: 'Cannot ban admin users',
      })
    }

    user.deletedAt = DateTime.now()
    await user.save()

    // Revoke all access tokens so the banned user is immediately logged out
    await db.from('auth_access_tokens').where('tokenable_id', user.id).delete()

    return response.ok({
      message: 'User banned successfully',
      user: {
        id: user.id,
        email: user.email,
        deletedAt: user.deletedAt,
      },
    })
  }

  /**
   * Unban a user
   */
  async unbanUser({ params, response }: HttpContext) {
    const user = await User.findOrFail(params.id)

    user.deletedAt = null
    await user.save()

    return response.ok({
      message: 'User unbanned successfully',
      user: {
        id: user.id,
        email: user.email,
        deletedAt: user.deletedAt,
      },
    })
  }

  /**
   * Ban a company (soft delete)
   */
  async banCompany({ params, response }: HttpContext) {
    const company = await Company.findOrFail(params.id)
    const user = await company.related('user').query().firstOrFail()

    if (user.userType === 'admin') {
      return response.forbidden({
        message: 'Cannot ban admin users',
      })
    }

    user.deletedAt = DateTime.now()
    await user.save()

    // Revoke all access tokens so the banned company is immediately logged out
    await db.from('auth_access_tokens').where('tokenable_id', user.id).delete()

    return response.ok({
      message: 'Company banned successfully',
      company: {
        id: company.id,
        userId: company.userId,
        deletedAt: user.deletedAt,
      },
    })
  }

  /**
   * Unban a company
   */
  async unbanCompany({ params, response }: HttpContext) {
    const company = await Company.findOrFail(params.id)
    const user = await company.related('user').query().firstOrFail()

    user.deletedAt = null
    await user.save()

    return response.ok({
      message: 'Company unbanned successfully',
      company: {
        id: company.id,
        userId: company.userId,
        deletedAt: user.deletedAt,
      },
    })
  }

  /**
   * Delete a hall
   */
  async deleteHall({ params, response }: HttpContext) {
    const hall = await Hall.findOrFail(params.id)

    hall.deletedAt = DateTime.now()
    await hall.save()

    return response.ok({
      message: 'Hall deleted successfully',
    })
  }

  /**
   * Delete a booking
   */
  async deleteBooking({ params, response }: HttpContext) {
    const booking = await Booking.findOrFail(params.id)

    booking.deletedAt = DateTime.now()
    await booking.save()

    return response.ok({
      message: 'Booking deleted successfully',
    })
  }

  /**
   * Get user by ID
   */
  async getUser({ params, response }: HttpContext) {
    const user = await User.query()
      .where('id', params.id)
      .where('userType', 'user')
      .whereNull('deletedAt')
      .preload('userProfile')
      .firstOrFail()

    return response.ok(user)
  }

  /**
   * Get company by ID
   */
  async getCompany({ params, response }: HttpContext) {
    const company = await Company.query()
      .where('id', params.id)
      .whereNull('deletedAt')
      .preload('user')
      .preload('companyProfile')
      .preload('halls')
      .preload('services')
      .firstOrFail()

    return response.ok(company)
  }

  /**
   * Get statistics
   */
  async getStatistics({ response }: HttpContext) {
    const getCount = (result: any[]) => Number(result[0]?.$extras?.total ?? 0)

    const totalUsers = await User.query()
      .where('userType', 'user')
      .whereNull('deletedAt')
      .count('* as total')
    const totalCompanies = await User.query()
      .where('userType', 'company')
      .whereNull('deletedAt')
      .count('* as total')
    const totalHalls = await Hall.query().whereNull('deletedAt').count('* as total')
    const totalBookings = await Booking.query().whereNull('deletedAt').count('* as total')
    const activeBookings = await Booking.query()
      .where('status', 'confirmed')
      .whereNull('deletedAt')
      .count('* as total')
    const bannedUsers = await User.query()
      .whereNotNull('deletedAt')
      .where('userType', 'user')
      .count('* as total')
    const bannedCompanies = await User.query()
      .whereNotNull('deletedAt')
      .where('userType', 'company')
      .count('* as total')
    const pendingCompanies = await Company.query().where('status', 'pending').count('* as total')

    return response.ok({
      users: {
        total: getCount(totalUsers),
        banned: getCount(bannedUsers),
      },
      companies: {
        total: getCount(totalCompanies),
        banned: getCount(bannedCompanies),
        pendingApproval: getCount(pendingCompanies),
      },
      halls: {
        total: getCount(totalHalls),
      },
      bookings: {
        total: getCount(totalBookings),
        active: getCount(activeBookings),
      },
    })
  }

  /**
   * Get pending company approvals
   */
  async getPendingCompanies({ request, response }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const companies = await Company.query()
      .where('status', 'pending')
      .preload('user')
      .preload('companyProfile')
      .orderBy('createdAt', 'asc')
      .paginate(page, limit)

    return response.ok(companies)
  }

  /**
   * Approve a company
   */
  async approveCompany({ params, auth, response }: HttpContext) {
    await auth.check()
    const admin = auth.getUserOrFail()

    const company = await Company.findOrFail(params.id)

    if (company.status === 'approved') {
      return response.badRequest({
        message: 'Company is already approved',
      })
    }

    company.status = 'approved'
    company.approvedAt = DateTime.now()
    company.approvedBy = admin.id
    company.rejectionReason = null
    company.rejectedAt = null
    await company.save()

    // Notify the company owner
    await company.load('companyProfile')
    const companyName = company.companyProfile?.companyName || 'Your company'
    await notificationService.notifyCompanyApproved(company.userId, companyName)

    return response.ok({
      message: 'Company approved successfully',
      company: {
        id: company.id,
        status: company.status,
        approvedAt: company.approvedAt,
        approvedBy: company.approvedBy,
      },
    })
  }

  /**
   * Reject a company
   */
  async rejectCompany({ params, request, response }: HttpContext) {
    const { reason } = request.only(['reason'])

    if (!reason || reason.trim().length < 10) {
      return response.badRequest({
        message: 'Rejection reason is required and must be at least 10 characters',
      })
    }

    const company = await Company.findOrFail(params.id)

    if (company.status === 'rejected') {
      return response.badRequest({
        message: 'Company is already rejected',
      })
    }

    company.status = 'rejected'
    company.rejectionReason = reason.trim()
    company.rejectedAt = DateTime.now()
    company.approvedAt = null
    company.approvedBy = null
    await company.save()

    // Notify the company owner
    await company.load('companyProfile')
    const companyName = company.companyProfile?.companyName || 'Your company'
    await notificationService.notifyCompanyRejected(company.userId, companyName, reason.trim())

    return response.ok({
      message: 'Company rejected successfully',
      company: {
        id: company.id,
        status: company.status,
        rejectionReason: company.rejectionReason,
        rejectedAt: company.rejectedAt,
      },
    })
  }

  /**
   * Suspend an approved company
   */
  async suspendCompany({ params, request, response }: HttpContext) {
    const { reason } = request.only(['reason'])

    if (!reason || reason.trim().length < 10) {
      return response.badRequest({
        message: 'Suspension reason is required and must be at least 10 characters',
      })
    }

    const company = await Company.findOrFail(params.id)

    if (company.status !== 'approved') {
      return response.badRequest({
        message: 'Only approved companies can be suspended',
      })
    }

    company.status = 'suspended'
    company.rejectionReason = reason.trim()
    await company.save()

    return response.ok({
      message: 'Company suspended successfully',
      company: {
        id: company.id,
        status: company.status,
        reason: company.rejectionReason,
      },
    })
  }

  /**
   * Reactivate a suspended company
   */
  async reactivateCompany({ params, response }: HttpContext) {
    const company = await Company.findOrFail(params.id)

    if (company.status !== 'suspended') {
      return response.badRequest({
        message: 'Only suspended companies can be reactivated',
      })
    }

    company.status = 'approved'
    company.rejectionReason = null
    await company.save()

    return response.ok({
      message: 'Company reactivated successfully',
      company: {
        id: company.id,
        status: company.status,
      },
    })
  }
}
