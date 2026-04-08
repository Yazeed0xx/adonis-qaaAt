import { BaseTransformer } from '@adonisjs/core/transformers'
import type Company from '#models/company'
import CompanyProfileTransformer from '#transformers/company_profile_transformer'
import HallTransformer from '#transformers/hall_transformer'
import ServiceTransformer from '#transformers/service_transformer'
import UserTransformer from '#transformers/user_transformer'

export default class CompanyTransformer extends BaseTransformer<Company> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'city', 'status', 'createdAt', 'updatedAt']),
      companyProfile: CompanyProfileTransformer.transform(
        this.whenLoaded(this.resource.companyProfile)
      ),
    }
  }

  forAdminView() {
    const user = this.whenLoaded(this.resource.user)
    const halls = this.whenLoaded(this.resource.halls)
    const services = this.whenLoaded(this.resource.services)

    return {
      ...this.toObject(),
      taxId: this.resource.taxId,
      registrationNumber: this.resource.registrationNumber,
      registrationNumberPdf: this.resource.registrationNumberPdf,
      businessLicense: this.resource.businessLicense,
      contactPerson: this.resource.contactPerson,
      businessAddress: this.resource.businessAddress,
      userId: this.resource.userId,
      approvedAt: this.resource.approvedAt,
      approvedBy: this.resource.approvedBy,
      rejectionReason: this.resource.rejectionReason,
      rejectedAt: this.resource.rejectedAt,
      deletedAt: this.resource.deletedAt,
      user: user ? UserTransformer.transform(user)!.useVariant('forAdminView') : undefined,
      halls: halls ? HallTransformer.transform(halls)!.useVariant('forAdminView') : undefined,
      services: services
        ? ServiceTransformer.transform(services)!.useVariant('forAdminView')
        : undefined,
    }
  }
}
