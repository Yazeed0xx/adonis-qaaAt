import { BaseTransformer } from '@adonisjs/core/transformers'
import type Hall from '#models/hall'
import { fromDatabaseAmount } from '#lib/money'
import CompanyTransformer from '#transformers/company_transformer'

export default class HallTransformer extends BaseTransformer<Hall> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'name',
        'description',
        'capacity',
        'location',
        'amenities',
        'images',
        'address',
        'city',
        'services',
        'isAvailable',
        'createdAt',
        'updatedAt',
      ]),
      pricing: fromDatabaseAmount(this.resource.pricing),
      company: CompanyTransformer.transform(this.whenLoaded(this.resource.company)),
    }
  }

  forAdminView() {
    return {
      ...this.toObject(),
      deletedAt: this.resource.deletedAt,
      companyId: this.resource.companyId,
    }
  }
}
