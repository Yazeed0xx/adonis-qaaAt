import { BaseTransformer } from '@adonisjs/core/transformers'
import type CompanyProfile from '#models/company_profile'

export default class CompanyProfileTransformer extends BaseTransformer<CompanyProfile> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'companyName',
      'description',
      'logo',
      'banner',
      'website',
      'socialLinks',
    ])
  }
}
