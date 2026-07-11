import Hall from '#models/hall'
import Company from '#models/company'
import CompanyNotFoundException from '#exceptions/company_not_found_exception'
import { HallCompatibilityService } from '#services/hall_compatibility_service'

export interface HallInput {
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
  private compatibility = new HallCompatibilityService()
  /**
   * Get company by user ID
   */
  private async getCompany(userId: number) {
    const company = await Company.findBy('userId', userId)
    if (!company) {
      throw new CompanyNotFoundException()
    }

    return company
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
    return this.compatibility.create(companyId, data)
  }

  /**
   * Update a hall
   */
  async updateHall(hallId: number, companyId: number, data: Partial<HallInput>) {
    return this.compatibility.update(hallId, companyId, data)
  }

  /**
   * Delete a hall
   */
  async deleteHall(hallId: number, companyId: number) {
    return this.compatibility.archive(hallId, companyId)
  }

  /**
   * Get company from user ID (helper method)
   */
  async getCompanyByUserId(userId: number) {
    return this.getCompany(userId)
  }
}
