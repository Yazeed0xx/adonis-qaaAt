import type { HttpContext } from '@adonisjs/core/http'
import Booking from '#models/booking'
import Company from '#models/company'
import Space from '#models/space'
import User from '#models/user'

export default class StatisticsController {
  async show({ response }: HttpContext) {
    const getCount = (result: any[]) => Number(result[0]?.$extras?.total ?? 0)

    const totalUsers = await User.query()
      .where('userType', 'user')
      .whereNull('deletedAt')
      .count('* as total')
    const totalCompanies = await Company.query().whereNull('deletedAt').count('* as total')
    const totalSpaces = await Space.query().whereNull('deletedAt').count('* as total')
    const totalBookings = await Booking.query().whereNull('deletedAt').count('* as total')
    const activeBookings = await Booking.query()
      .where('status', 'confirmed')
      .whereNull('deletedAt')
      .count('* as total')
    const bannedUsers = await User.query()
      .whereNotNull('deletedAt')
      .where('userType', 'user')
      .count('* as total')
    const bannedCompanies = await Company.query().whereNotNull('deletedAt').count('* as total')
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
        spaces: {
          total: getCount(totalSpaces),
        },
        bookings: {
          total: getCount(totalBookings),
          active: getCount(activeBookings),
        },
      },
    })
  }
}
