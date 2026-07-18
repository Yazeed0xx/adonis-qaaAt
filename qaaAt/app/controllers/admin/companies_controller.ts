import type { HttpContext } from '@adonisjs/core/http'
import Company from '#models/company'
import CompanyTransformer from '#transformers/company_transformer'

export default class CompaniesController {
  async index({ request, serialize }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const companies = await Company.query()
      .preload('user')
      .preload('companyProfile')
      .whereNull('deletedAt')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)

    return serialize(
      CompanyTransformer.paginate(companies.all(), companies.getMeta()).useVariant('forAdminView')
    )
  }

  async pending({ request, serialize }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20))

    const companies = await Company.query()
      .where('status', 'pending')
      .preload('user')
      .preload('companyProfile')
      .orderBy('createdAt', 'asc')
      .paginate(page, limit)

    return serialize(
      CompanyTransformer.paginate(companies.all(), companies.getMeta()).useVariant('forAdminView')
    )
  }

  async show({ params, serialize }: HttpContext) {
    const company = await Company.query()
      .where('id', params.id)
      .whereNull('deletedAt')
      .preload('user')
      .preload('companyProfile')
      .firstOrFail()

    return serialize(CompanyTransformer.transform(company).useVariant('forAdminView'))
  }
}
