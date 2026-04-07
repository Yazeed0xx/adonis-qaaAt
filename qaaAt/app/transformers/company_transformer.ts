import { BaseTransformer } from '@adonisjs/core/transformers'
import type Company from '#models/company'
import CompanyProfileTransformer from '#transformers/company_profile_transformer'

export default class CompanyTransformer extends BaseTransformer<Company> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'city', 'status', 'createdAt', 'updatedAt']),
      companyProfile: CompanyProfileTransformer.transform(
        this.whenLoaded(this.resource.companyProfile)
      ),
    }
  }
}
