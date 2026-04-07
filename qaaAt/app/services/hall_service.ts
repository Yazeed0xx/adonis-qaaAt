import Hall from '#models/hall'
import Company from '#models/company'
import { DateTime } from 'luxon'

interface HallInput {
  name: string
  capacity: number
  location: string
  pricing: number
  address: string
  city: string
  description?: string
  amenities?: any
  images?: string[]
  services?: string[]
  isAvailable?: boolean
}

export class HallService {
  private toDatabaseAmount(value: number) {
    return String(value)
  }

  /**
   * Get company by user ID
   */
  private async getCompany(userId: number) {
    return Company.findByOrFail('userId', userId)
  }

  /**
   * Get all halls for a company
   */

  async getAllHalls(companyId: number, page: number = 1, limit: number = 20) {
    return Hall.query()
      .where('companyId', companyId)
      .whereNull('deletedAt')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)
  }

  /**
   * Get a single hall by ID for a company
   */
  async getHallById(hallId: number, companyId: number) {
    return Hall.query()
      .where('id', hallId)
      .where('companyId', companyId)
      .whereNull('deletedAt')
      .preload('bookings')
      .firstOrFail()
  }

  /**
   * Create a new hall
   */
  async createHall(companyId: number, data: HallInput) {
    return Hall.create({
      ...data,
      pricing: this.toDatabaseAmount(data.pricing),
      companyId,
      isAvailable: data.isAvailable ?? true,
    })
  }

  /**
   * Update a hall
   */
  async updateHall(hallId: number, companyId: number, data: Partial<HallInput>) {
    const hall = await Hall.query().where('id', hallId).where('companyId', companyId).firstOrFail()

    hall.merge({
      ...data,
      pricing: data.pricing !== undefined ? this.toDatabaseAmount(data.pricing) : undefined,
    })
    await hall.save()

    return hall
  }

  /**
   * Delete a hall
   */
  async deleteHall(hallId: number, companyId: number) {
    const hall = await Hall.query().where('id', hallId).where('companyId', companyId).firstOrFail()

    hall.deletedAt = DateTime.now()
    await hall.save()
    return hall
  }

  /**
   * Get company from user ID (helper method)
   */
  async getCompanyByUserId(userId: number) {
    return this.getCompany(userId)
  }
}
