import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
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
      table.string('name_ar', 180).nullable()
      table.string('name_en', 180).nullable()
      table.text('description_ar').nullable()
      table.text('description_en').nullable()
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
      table.unique(['id', 'company_id'], { indexName: 'spaces_id_company_unique' })
      table
        .foreign(['venue_id', 'company_id'], 'spaces_venue_company_fk')
        .references(['id', 'company_id'])
        .inTable('venues')
        .onDelete('RESTRICT')
      table.index(['company_id', 'publication_status', 'deleted_at'])
      table.index(['category_id', 'publication_status'])
      table.index(['venue_id'])
      table.check('(name_ar IS NOT NULL OR name_en IS NOT NULL)', [], 'spaces_name_required_check')
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
  }

  async down() {
    this.schema.dropTable('spaces')
  }
}
