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
      user: UserTransformer.transform(this.whenLoaded(this.resource.user))?.useVariant(
        'forAdminView'
      ),
      halls: HallTransformer.transform(this.whenLoaded(this.resource.halls))?.useVariant(
        'forAdminView'
      ),
      services: ServiceTransformer.transform(this.whenLoaded(this.resource.services))?.useVariant(
        'forAdminView'
      ),
    }
  }
}
