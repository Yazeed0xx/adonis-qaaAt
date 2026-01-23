import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Company from '#models/company'
import Hall from '#models/hall'
import Booking from '#models/booking'
import { DateTime } from 'luxon'

export default class AdminController {
  /**
   * Get all users
   */
  async getUsers({ request, response }: HttpContext) {
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)

    const users = await User.query()
      .preload('userProfile')
      .where('userType', 'user')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return response.ok(users)
  }

  /**
   * Get all companies
   */
  async getCompanies({ request, response }: HttpContext) {
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)

    const companies = await Company.query()
      .preload('user')
      .preload('companyProfile')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return response.ok(companies)
  }

  /**
   * Get all halls
   */
  async getHalls({ request, response }: HttpContext) {
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)

    const halls = await Hall.query()
      .preload('company')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return response.ok(halls)
  }

  /**
   * Get all bookings
   */
  async getBookings({ request, response }: HttpContext) {
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)

    const bookings = await Booking.query()
      .preload('user')
      .preload('hall')
      .preload('services')
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

    user.deletedAt = DateTime.now()
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

    await hall.delete()

    return response.ok({
      message: 'Hall deleted successfully',
    })
  }

  /**
   * Delete a booking
   */
  async deleteBooking({ params, response }: HttpContext) {
    const booking = await Booking.findOrFail(params.id)

    await booking.delete()

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
    const totalUsers = await User.query().where('userType', 'user').count('* as total')
    const totalCompanies = await User.query().where('userType', 'company').count('* as total')
    const totalHalls = await Hall.query().count('* as total')
    const totalBookings = await Booking.query().count('* as total')
    const activeBookings = await Booking.query()
      .where('status', 'confirmed')
      .count('* as total')
    const bannedUsers = await User.query()
      .whereNotNull('deletedAt')
      .where('userType', 'user')
      .count('* as total')
    const bannedCompanies = await User.query()
      .whereNotNull('deletedAt')
      .where('userType', 'company')
      .count('* as total')

    return response.ok({
      users: {
        total: Number(totalUsers[0].$extras.total),
        banned: Number(bannedUsers[0].$extras.total),
      },
      companies: {
        total: Number(totalCompanies[0].$extras.total),
        banned: Number(bannedCompanies[0].$extras.total),
      },
      halls: {
        total: Number(totalHalls[0].$extras.total),
      },
      bookings: {
        total: Number(totalBookings[0].$extras.total),
        active: Number(activeBookings[0].$extras.total),
      },
    })
  }
}
