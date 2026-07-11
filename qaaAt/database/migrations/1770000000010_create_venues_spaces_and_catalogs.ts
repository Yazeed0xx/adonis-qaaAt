import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_categories', (table) => {
      table.increments('id').primary()
      table.string('slug', 80).notNullable().unique()
      table.string('name_ar', 120).notNullable()
      table.string('name_en', 120).notNullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('venues', (table) => {
      table.increments('id').primary()
      table
        .integer('company_id')
        .unsigned()
        .notNullable()
        .references('companies.id')
        .onDelete('RESTRICT')
      table.string('name_ar', 180).nullable()
      table.string('name_en', 180).nullable()
      table.string('legacy_name', 180).nullable()
      table.string('city', 120).notNullable()
      table.string('district', 120).nullable()
      table.string('street', 180).nullable()
      table.string('building_number', 40).nullable()
      table.string('postal_code', 20).nullable()
      table.string('additional_number', 40).nullable()
      table.text('legacy_location').nullable()
      table.text('legacy_address').nullable()
      table.text('access_instructions_ar').nullable()
      table.text('access_instructions_en').nullable()
      table.text('parking_notes_ar').nullable()
      table.text('parking_notes_en').nullable()
      table.decimal('latitude', 10, 7).nullable()
      table.decimal('longitude', 10, 7).nullable()
      table
        .enum('verification_status', ['unverified', 'verified', 'rejected'])
        .notNullable()
        .defaultTo('unverified')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()
      table.unique(['id', 'company_id'], { indexName: 'venues_id_company_unique' })
      table.index(['company_id', 'deleted_at'])
      table.check(
        '(name_ar IS NOT NULL OR name_en IS NOT NULL OR legacy_name IS NOT NULL)',
        [],
        'venues_name_required_check'
      )
      table.check('(latitude IS NULL OR latitude BETWEEN -90 AND 90)', [], 'venues_latitude_check')
      table.check(
        '(longitude IS NULL OR longitude BETWEEN -180 AND 180)',
        [],
        'venues_longitude_check'
      )
    })

    this.schema.createTable('spaces', (table) => {
      table.increments('id').primary()
      table
        .integer('company_id')
        .unsigned()
        .notNullable()
        .references('companies.id')
        .onDelete('RESTRICT')
      table.integer('venue_id').unsigned().notNullable()
      table
        .integer('category_id')
        .unsigned()
        .notNullable()
        .references('space_categories.id')
        .onDelete('RESTRICT')
      table
        .integer('legacy_hall_id')
        .unsigned()
        .nullable()
        .unique()
        .references('halls.id')
        .onDelete('RESTRICT')
      table.string('name_ar', 180).nullable()
      table.string('name_en', 180).nullable()
      table.string('legacy_name', 180).nullable()
      table.text('description_ar').nullable()
      table.text('description_en').nullable()
      table.text('legacy_description').nullable()
      table
        .enum('booking_mode', ['request_to_book', 'quote_required', 'instant_book'])
        .notNullable()
      table
        .enum('publication_status', [
          'draft',
          'pending_review',
          'changes_requested',
          'published',
          'suspended',
          'archived',
        ])
        .notNullable()
        .defaultTo('draft')
      table.integer('capacity_total').unsigned().notNullable()
      table.boolean('requires_visit').notNullable().defaultTo(false)
      table.boolean('legacy_is_available').nullable()
      table.integer('minimum_duration_minutes').unsigned().nullable()
      table.integer('maximum_duration_minutes').unsigned().nullable()
      table.integer('minimum_notice_hours').unsigned().nullable()
      table.timestamp('instant_book_approved_at').nullable()
      table
        .integer('instant_book_approved_by')
        .unsigned()
        .nullable()
        .references('users.id')
        .onDelete('SET NULL')
      table.timestamp('published_at').nullable()
      table
        .integer('published_by')
        .unsigned()
        .nullable()
        .references('users.id')
        .onDelete('SET NULL')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()
      table
        .foreign(['venue_id', 'company_id'], 'spaces_venue_company_fk')
        .references(['id', 'company_id'])
        .inTable('venues')
        .onDelete('RESTRICT')
      table.index(['company_id', 'publication_status', 'deleted_at'])
      table.index(['category_id', 'publication_status'])
      table.index(['venue_id'])
      table.check(
        '(name_ar IS NOT NULL OR name_en IS NOT NULL OR legacy_name IS NOT NULL)',
        [],
        'spaces_name_required_check'
      )
      table.check('capacity_total > 0', [], 'spaces_capacity_positive_check')
      table.check(
        '(minimum_duration_minutes IS NULL OR maximum_duration_minutes IS NULL OR minimum_duration_minutes <= maximum_duration_minutes)',
        [],
        'spaces_duration_range_check'
      )
      table.check(
        "(booking_mode <> 'instant_book' OR instant_book_approved_at IS NOT NULL)",
        [],
        'spaces_instant_book_gate_check'
      )
    })

    this.schema.createTable('space_event_details', (table) => {
      table.integer('space_id').unsigned().primary().references('spaces.id').onDelete('CASCADE')
      table.integer('male_capacity').unsigned().nullable()
      table.integer('female_capacity').unsigned().nullable()
      table.boolean('has_separate_entrances').nullable()
      table.boolean('has_bridal_room').nullable()
      table.boolean('has_stage').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('space_layout_capacities', (table) => {
      table.increments('id').primary()
      table.integer('space_id').unsigned().notNullable().references('spaces.id').onDelete('CASCADE')
      table
        .enum('layout', [
          'boardroom',
          'classroom',
          'theater',
          'u_shape',
          'banquet',
          'standing',
          'cabaret',
        ])
        .notNullable()
      table.integer('capacity').unsigned().notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.unique(['space_id', 'layout'])
      table.check('capacity > 0', [], 'space_layout_capacity_positive_check')
    })

    this.schema.createTable('space_large_format_details', (table) => {
      table.integer('space_id').unsigned().primary().references('spaces.id').onDelete('CASCADE')
      table.decimal('floor_area_sqm', 10, 2).nullable()
      table.decimal('ceiling_height_m', 6, 2).nullable()
      table.boolean('has_loading_access').nullable()
      table.integer('visitor_capacity').unsigned().nullable()
      table.string('power_requirement', 120).nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.check(
        '(floor_area_sqm IS NULL OR floor_area_sqm > 0)',
        [],
        'space_large_floor_area_check'
      )
      table.check(
        '(ceiling_height_m IS NULL OR ceiling_height_m > 0)',
        [],
        'space_large_ceiling_height_check'
      )
    })

    this.schema.createTable('amenity_definitions', (table) => {
      table.increments('id').primary()
      table.string('slug', 80).notNullable().unique()
      table.string('name_ar', 120).notNullable()
      table.string('name_en', 120).notNullable()
      table.string('group', 80).notNullable()
      table.boolean('is_searchable').notNullable().defaultTo(true)
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('space_amenities', (table) => {
      table.increments('id').primary()
      table.integer('space_id').unsigned().notNullable().references('spaces.id').onDelete('CASCADE')
      table
        .integer('amenity_definition_id')
        .unsigned()
        .notNullable()
        .references('amenity_definitions.id')
        .onDelete('RESTRICT')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.unique(['space_id', 'amenity_definition_id'])
    })

    this.schema.createTable('space_media', (table) => {
      table.increments('id').primary()
      table.integer('space_id').unsigned().notNullable().references('spaces.id').onDelete('CASCADE')
      table.enum('media_type', ['image', 'video', 'document']).notNullable()
      table.string('storage_key', 500).nullable()
      table.text('legacy_reference').nullable()
      table.enum('provenance', ['controlled_storage', 'legacy_imported']).notNullable()
      table.string('alt_text_ar', 240).nullable()
      table.string('alt_text_en', 240).nullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      table.boolean('is_cover').notNullable().defaultTo(false)
      table
        .enum('moderation_status', ['pending', 'approved', 'rejected'])
        .notNullable()
        .defaultTo('pending')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.check(
        "((provenance = 'controlled_storage' AND storage_key IS NOT NULL AND legacy_reference IS NULL) OR (provenance = 'legacy_imported' AND legacy_reference IS NOT NULL AND storage_key IS NULL))",
        [],
        'space_media_storage_source_check'
      )
      table.index(['space_id', 'sort_order'])
    })
    this.schema.raw(
      'CREATE UNIQUE INDEX space_media_one_cover_unique ON space_media (space_id) WHERE is_cover = true'
    )

    this.schema.createTable('space_moderation_events', (table) => {
      table.bigIncrements('id').primary()
      table
        .integer('space_id')
        .unsigned()
        .notNullable()
        .references('spaces.id')
        .onDelete('RESTRICT')
      table
        .integer('company_id')
        .unsigned()
        .notNullable()
        .references('companies.id')
        .onDelete('RESTRICT')
      table
        .integer('actor_user_id')
        .unsigned()
        .nullable()
        .references('users.id')
        .onDelete('SET NULL')
      table.string('action', 80).notNullable()
      table.string('previous_status', 40).nullable()
      table.string('next_status', 40).notNullable()
      table.text('reason').nullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['space_id', 'created_at'])
      table.index(['company_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable('space_moderation_events')
    this.schema.dropTable('space_media')
    this.schema.dropTable('space_amenities')
    this.schema.dropTable('amenity_definitions')
    this.schema.dropTable('space_large_format_details')
    this.schema.dropTable('space_layout_capacities')
    this.schema.dropTable('space_event_details')
    this.schema.dropTable('spaces')
    this.schema.dropTable('venues')
    this.schema.dropTable('space_categories')
  }
}
