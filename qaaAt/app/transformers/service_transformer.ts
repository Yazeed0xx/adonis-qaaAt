import { BaseTransformer } from '@adonisjs/core/transformers'
import type Service from '#models/service'
import { fromDatabaseAmount } from '#lib/money'

export default class ServiceTransformer extends BaseTransformer<Service> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'name',
        'description',
        'isActive',
        'createdAt',
        'updatedAt',
      ]),
      price: fromDatabaseAmount(this.resource.price),
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
