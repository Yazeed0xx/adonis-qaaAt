import db from '@adonisjs/lucid/services/db'
import AdminOperationException from '#exceptions/admin_operation_exception'
import adminAuditService from '#services/admin_audit_service'

type CategoryUpdate = {
  nameAr?: string
  nameEn?: string
  isActive?: boolean
  sortOrder?: number
}

type AmenityCreate = {
  slug: string
  nameAr: string
  nameEn: string
  group: string
  isSearchable?: boolean
  isActive?: boolean
}

type AmenityUpdate = Partial<Omit<AmenityCreate, 'slug'>>

function requireChanges(input: Record<string, unknown>) {
  if (Object.values(input).every((value) => value === undefined)) {
    throw new AdminOperationException(
      'At least one field must be provided',
      'ADMIN_CATALOG_NO_CHANGES',
      422
    )
  }
}

export class AdminCatalogService {
  async list() {
    const [categories, amenities] = await Promise.all([
      db.from('space_categories').orderBy('sort_order').orderBy('id'),
      db.from('amenity_definitions').orderBy('group').orderBy('id'),
    ])
    return { categories, amenities }
  }

  async updateCategory(adminUserId: number, categoryId: number, input: CategoryUpdate) {
    requireChanges(input)
    return db.transaction(async (trx) => {
      const category = await trx
        .from('space_categories')
        .where('id', categoryId)
        .forUpdate()
        .first()
      if (!category)
        throw new AdminOperationException('Category not found', 'SPACE_CATEGORY_NOT_FOUND', 404)

      const [updated] = await trx
        .from('space_categories')
        .where('id', categoryId)
        .update({
          name_ar: input.nameAr ?? category.name_ar,
          name_en: input.nameEn ?? category.name_en,
          is_active: input.isActive ?? category.is_active,
          sort_order: input.sortOrder ?? category.sort_order,
          updated_at: new Date(),
        })
        .returning('*')
      await adminAuditService.record(
        {
          adminUserId,
          action: 'space_category.update',
          targetType: 'space_category',
          targetId: categoryId,
          metadata: { before: category, after: updated },
        },
        trx
      )
      return updated
    })
  }

  async createAmenity(adminUserId: number, input: AmenityCreate) {
    return db.transaction(async (trx) => {
      const [amenity] = await trx
        .table('amenity_definitions')
        .insert({
          slug: input.slug,
          name_ar: input.nameAr,
          name_en: input.nameEn,
          group: input.group,
          is_searchable: input.isSearchable ?? true,
          is_active: input.isActive ?? true,
          created_at: new Date(),
        })
        .onConflict('slug')
        .ignore()
        .returning('*')
      if (!amenity)
        throw new AdminOperationException('Amenity slug already exists', 'AMENITY_SLUG_CONFLICT')
      await adminAuditService.record(
        {
          adminUserId,
          action: 'amenity.create',
          targetType: 'amenity_definition',
          targetId: amenity.id,
          metadata: { slug: amenity.slug },
        },
        trx
      )
      return amenity
    })
  }

  async updateAmenity(adminUserId: number, amenityId: number, input: AmenityUpdate) {
    requireChanges(input)
    return db.transaction(async (trx) => {
      const amenity = await trx
        .from('amenity_definitions')
        .where('id', amenityId)
        .forUpdate()
        .first()
      if (!amenity) throw new AdminOperationException('Amenity not found', 'AMENITY_NOT_FOUND', 404)
      const [updated] = await trx
        .from('amenity_definitions')
        .where('id', amenityId)
        .update({
          name_ar: input.nameAr ?? amenity.name_ar,
          name_en: input.nameEn ?? amenity.name_en,
          group: input.group ?? amenity.group,
          is_searchable: input.isSearchable ?? amenity.is_searchable,
          is_active: input.isActive ?? amenity.is_active,
          updated_at: new Date(),
        })
        .returning('*')
      await adminAuditService.record(
        {
          adminUserId,
          action: 'amenity.update',
          targetType: 'amenity_definition',
          targetId: amenityId,
          metadata: { before: amenity, after: updated },
        },
        trx
      )
      return updated
    })
  }
}
