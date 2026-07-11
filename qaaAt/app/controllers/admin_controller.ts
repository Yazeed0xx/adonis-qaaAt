import type { HttpContext } from '@adonisjs/core/http'
import AccessDeniedException from '#exceptions/access_denied_exception'
import InvalidInputException from '#exceptions/invalid_input_exception'
import InvalidStateException from '#exceptions/invalid_state_exception'
import User from '#models/user'
import Company from '#models/company'
import Hall from '#models/hall'
import Booking from '#models/booking'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import adminAuditService from '#services/admin_audit_service'
import notificationOutboxService from '#services/notification_outbox_service'
import pushInstallationService from '#services/push_installation_service'
import BookingTransformer from '#transformers/booking_transformer'
import CompanyTransformer from '#transformers/company_transformer'
import HallTransformer from '#transformers/hall_transformer'
import UserTransformer from '#transformers/user_transformer'

export default class AdminController {
  /**
   * Get all users
   */
  async getUsers({ request, serialize }: HttpContext) {
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

  /**
   * Get all companies
   */
  async getCompanies({ request, serialize }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const companies = await Company.query()
      .preload('user')
      .preload('companyProfile')
      .whereNull('deletedAt')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return serialize(
      CompanyTransformer.paginate(companies.all(), companies.getMeta()).useVariant('forAdminView')
    )
  }

  /**
   * Get all halls
   */
  async getHalls({ request, serialize }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const halls = await Hall.query()
      .preload('company')
      .whereNull('deletedAt')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return serialize(
      HallTransformer.paginate(halls.all(), halls.getMeta()).useVariant('forAdminView')
    )
  }

  /**
   * Get all bookings
   */
  async getBookings({ request, serialize }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const bookings = await Booking.query()
      .preload('user')
      .preload('hall')
      .preload('services')
      .whereNull('deletedAt')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return serialize(
      BookingTransformer.paginate(bookings.all(), bookings.getMeta()).useVariant('forAdminView')
    )
  }

  /**
   * Ban a user (soft delete)
   */
  async banUser({ params, auth, response }: HttpContext) {
    await auth.check()
    const admin = auth.getUserOrFail()
    const user = await User.findOrFail(params.id)

    if (user.userType === 'admin') {
      throw new AccessDeniedException('Cannot ban admin users')
    }

    await db.transaction(async (trx) => {
      user.useTransaction(trx)
      user.deletedAt = DateTime.now()
      await user.save()

      await trx.from('auth_access_tokens').where('tokenable_id', user.id).delete()
      await pushInstallationService.revokeAll(user.id, trx)
      await adminAuditService.record(
        {
          adminUserId: admin.id,
          action: 'user.ban',
          targetType: 'user',
          targetId: user.id,
          metadata: { email: user.email },
        },
        trx
      )
    })

    return response.ok({
      message: 'User banned successfully',
      data: {
        id: user.id,
        email: user.email,
        deletedAt: user.deletedAt,
      },
    })
  }

  /**
   * Unban a user
   */
  async unbanUser({ params, auth, response }: HttpContext) {
    await auth.check()
    const admin = auth.getUserOrFail()
    const user = await User.findOrFail(params.id)

    user.deletedAt = null
    await user.save()

    await adminAuditService.record({
      adminUserId: admin.id,
      action: 'user.unban',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: user.email },
    })

    return response.ok({
      message: 'User unbanned successfully',
      data: {
        id: user.id,
        email: user.email,
        deletedAt: user.deletedAt,
      },
    })
  }

  /**
   * Ban a company (soft delete)
   */
  async banCompany({ params, auth, response }: HttpContext) {
    await auth.check()
    const admin = auth.getUserOrFail()
    const company = await Company.findOrFail(params.id)
    const user = await company.related('user').query().firstOrFail()

    if (user.userType === 'admin') {
      throw new AccessDeniedException('Cannot ban admin users')
    }

    await db.transaction(async (trx) => {
      user.useTransaction(trx)
      user.deletedAt = DateTime.now()
      await user.save()

      await trx.from('auth_access_tokens').where('tokenable_id', user.id).delete()
      await pushInstallationService.revokeAll(user.id, trx)
      await adminAuditService.record(
        {
          adminUserId: admin.id,
          action: 'company.ban',
          targetType: 'company',
          targetId: company.id,
          metadata: { userId: user.id },
        },
        trx
      )
    })

    return response.ok({
      message: 'Company banned successfully',
      data: {
        id: company.id,
        userId: company.userId,
        deletedAt: user.deletedAt,
      },
    })
  }

  /**
   * Unban a company
   */
  async unbanCompany({ params, auth, response }: HttpContext) {
    await auth.check()
    const admin = auth.getUserOrFail()
    const company = await Company.findOrFail(params.id)
    const user = await company.related('user').query().firstOrFail()

    user.deletedAt = null
    await user.save()

    await adminAuditService.record({
      adminUserId: admin.id,
      action: 'company.unban',
      targetType: 'company',
      targetId: company.id,
      metadata: { userId: user.id },
    })

    return response.ok({
      message: 'Company unbanned successfully',
      data: {
        id: company.id,
        userId: company.userId,
        deletedAt: user.deletedAt,
      },
    })
  }

  /**
   * Delete a hall
   */
  async deleteHall({ params, auth, response }: HttpContext) {
    await auth.check()
    const admin = auth.getUserOrFail()
    const hall = await Hall.findOrFail(params.id)

    hall.deletedAt = DateTime.now()
    await hall.save()

    await adminAuditService.record({
      adminUserId: admin.id,
      action: 'hall.delete',
      targetType: 'hall',
      targetId: hall.id,
      metadata: { companyId: hall.companyId },
    })

    return response.ok({
      message: 'Hall deleted successfully',
    })
  }

  /**
   * Delete a booking
   */
  async deleteBooking({ params, auth, response }: HttpContext) {
    await auth.check()
    const admin = auth.getUserOrFail()
    const booking = await Booking.findOrFail(params.id)

    booking.deletedAt = DateTime.now()
    await booking.save()

    await adminAuditService.record({
      adminUserId: admin.id,
      action: 'booking.delete',
      targetType: 'booking',
      targetId: booking.id,
      metadata: { userId: booking.userId, hallId: booking.hallId },
    })

    return response.ok({
      message: 'Booking deleted successfully',
    })
  }

  /**
   * Get user by ID
   */
  async getUser({ params, serialize }: HttpContext) {
    const user = await User.query()
      .where('id', params.id)
      .where('userType', 'user')
      .whereNull('deletedAt')
      .preload('userProfile')
      .firstOrFail()

    return serialize(UserTransformer.transform(user).useVariant('forAdminView'))
  }

  /**
   * Get company by ID
   */
  async getCompany({ params, serialize }: HttpContext) {
    const company = await Company.query()
      .where('id', params.id)
      .whereNull('deletedAt')
      .preload('user')
      .preload('companyProfile')
      .preload('halls')
      .preload('services')
      .firstOrFail()

    return serialize(CompanyTransformer.transform(company).useVariant('forAdminView'))
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
      data: {
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
      },
    })
  }

  /**
   * Get pending company approvals
   */
  async getPendingCompanies({ request, serialize }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const companies = await Company.query()
      .where('status', 'pending')
      .preload('user')
      .preload('companyProfile')
      .orderBy('createdAt', 'asc')
      .paginate(page, limit)

    return serialize(
      CompanyTransformer.paginate(companies.all(), companies.getMeta()).useVariant('forAdminView')
    )
  }

  /**
   * Approve a company
   */
  async approveCompany({ params, auth, response }: HttpContext) {
    await auth.check()
    const admin = auth.getUserOrFail()

    const company = await Company.findOrFail(params.id)

    if (company.status === 'approved') {
      throw new InvalidStateException('Company is already approved', 'COMPANY_ALREADY_APPROVED')
    }

    await company.load('companyProfile')
    const companyName = company.companyProfile?.companyName || 'Your company'
    await db.transaction(async (trx) => {
      company.useTransaction(trx)
      company.status = 'approved'
      company.approvedAt = DateTime.now()
      company.approvedBy = admin.id
      company.rejectionReason = null
      company.rejectedAt = null
      await company.save()

      await adminAuditService.record(
        {
          adminUserId: admin.id,
          action: 'company.approve',
          targetType: 'company',
          targetId: company.id,
          metadata: { userId: company.userId },
        },
        trx
      )
      await notificationOutboxService.enqueue(
        {
          userId: company.userId,
          type: 'company_approved',
          title: 'Company Approved',
          message: `Congratulations! Your company "${companyName}" has been approved. You can now create halls and start receiving bookings.`,
          sendEmail: true,
          emailSubject: 'Your Company Has Been Approved - QaaAt',
        },
        trx
      )
    })

    return response.ok({
      message: 'Company approved successfully',
      data: {
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
  async rejectCompany({ params, request, auth, response }: HttpContext) {
    await auth.check()
    const admin = auth.getUserOrFail()
    const { reason } = request.only(['reason'])

    if (!reason || reason.trim().length < 10) {
      throw new InvalidInputException(
        'Rejection reason is required and must be at least 10 characters',
        'REJECTION_REASON_INVALID'
      )
    }

    const company = await Company.findOrFail(params.id)

    if (company.status === 'rejected') {
      throw new InvalidStateException('Company is already rejected', 'COMPANY_ALREADY_REJECTED')
    }

    await company.load('companyProfile')
    const companyName = company.companyProfile?.companyName || 'Your company'
    await db.transaction(async (trx) => {
      company.useTransaction(trx)
      company.status = 'rejected'
      company.rejectionReason = reason.trim()
      company.rejectedAt = DateTime.now()
      company.approvedAt = null
      company.approvedBy = null
      await company.save()

      await adminAuditService.record(
        {
          adminUserId: admin.id,
          action: 'company.reject',
          targetType: 'company',
          targetId: company.id,
          reason: reason.trim(),
          metadata: { userId: company.userId },
        },
        trx
      )
      await notificationOutboxService.enqueue(
        {
          userId: company.userId,
          type: 'company_rejected',
          title: 'Company Registration Rejected',
          message: `Your company "${companyName}" registration was rejected. Reason: ${reason.trim()}`,
          data: { reason: reason.trim() },
          sendEmail: true,
          emailSubject: 'Company Registration Update - QaaAt',
        },
        trx
      )
    })

    return response.ok({
      message: 'Company rejected successfully',
      data: {
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
  async suspendCompany({ params, request, auth, response }: HttpContext) {
    await auth.check()
    const admin = auth.getUserOrFail()
    const { reason } = request.only(['reason'])

    if (!reason || reason.trim().length < 10) {
      throw new InvalidInputException(
        'Suspension reason is required and must be at least 10 characters',
        'SUSPENSION_REASON_INVALID'
      )
    }

    const company = await Company.findOrFail(params.id)

    if (company.status !== 'approved') {
      throw new InvalidStateException(
        'Only approved companies can be suspended',
        'COMPANY_SUSPEND_INVALID_STATE'
      )
    }

    await db.transaction(async (trx) => {
      company.useTransaction(trx)
      company.status = 'suspended'
      company.rejectionReason = reason.trim()
      await company.save()

      await trx.from('auth_access_tokens').where('tokenable_id', company.userId).delete()
      await pushInstallationService.revokeAll(company.userId, trx)

      await adminAuditService.record(
        {
          adminUserId: admin.id,
          action: 'company.suspend',
          targetType: 'company',
          targetId: company.id,
          reason: reason.trim(),
          metadata: { userId: company.userId },
        },
        trx
      )
    })

    return response.ok({
      message: 'Company suspended successfully',
      data: {
        id: company.id,
        status: company.status,
        reason: company.rejectionReason,
      },
    })
  }

  /**
   * Reactivate a suspended company
   */
  async reactivateCompany({ params, auth, response }: HttpContext) {
    await auth.check()
    const admin = auth.getUserOrFail()
    const company = await Company.findOrFail(params.id)

    if (company.status !== 'suspended') {
      throw new InvalidStateException(
        'Only suspended companies can be reactivated',
        'COMPANY_REACTIVATE_INVALID_STATE'
      )
    }

    await db.transaction(async (trx) => {
      company.useTransaction(trx)
      company.status = 'approved'
      company.rejectionReason = null
      await company.save()

      await adminAuditService.record(
        {
          adminUserId: admin.id,
          action: 'company.reactivate',
          targetType: 'company',
          targetId: company.id,
          metadata: { userId: company.userId },
        },
        trx
      )
    })

    return response.ok({
      message: 'Company reactivated successfully',
      data: {
        id: company.id,
        status: company.status,
      },
    })
  }
}
