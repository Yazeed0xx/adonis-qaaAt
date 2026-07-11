import type { HttpContext } from '@adonisjs/core/http'
import SpaceCategory from '#models/space_category'
import AmenityDefinition from '#models/amenity_definition'
export default class SpaceCatalogController {
  async index({ response }: HttpContext) {
    const [categories, amenities] = await Promise.all([
      SpaceCategory.query().where('isActive', true).orderBy('sortOrder'),
      AmenityDefinition.query().where('isActive', true).orderBy('group').orderBy('id'),
    ])
    return response.ok({
      data: {
        categories: categories.map((item) => ({
          id: item.id,
          slug: item.slug,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
        })),
        amenities: amenities.map((item) => ({
          id: item.id,
          slug: item.slug,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          group: item.group,
          isSearchable: item.isSearchable,
        })),
      },
    })
  }
}
