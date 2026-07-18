import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('package_items', (table) => {
      table.increments('id').primary()
      table.integer('package_id').unsigned().notNullable()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('service_option_id').unsigned().nullable()
      table
        .enum('item_type', [
          'hall_rental',
          'hospitality',
          'seating',
          'bridal_room',
          'stage',
          'equipment',
          'staffing',
          'setup',
          'teardown',
          'service',
        ])
        .notNullable()
      table.string('description_ar', 240).nullable()
      table.string('description_en', 240).nullable()
      table.integer('quantity').unsigned().notNullable().defaultTo(1)
      table.boolean('is_included').notNullable().defaultTo(true)
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.check('quantity > 0')
      table.check(
        'description_ar IS NOT NULL OR description_en IS NOT NULL OR service_option_id IS NOT NULL'
      )
      table
        .foreign(['package_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('packages')
      table
        .foreign(['service_option_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('service_options')
      table.index(['package_id', 'sort_order'])
    })
  }

  async down() {
    this.schema.dropTable('package_items')
  }
}
