import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('quote_line_items', (table) => {
      table.bigIncrements('id').primary()
      table.integer('quote_revision_id').unsigned().notNullable()
      table.integer('company_id').unsigned().notNullable()
      table.integer('rate_plan_id').unsigned().nullable()
      table.integer('package_id').unsigned().nullable()
      table.integer('service_option_id').unsigned().nullable()
      table.enum('item_type', ['rate_plan', 'package', 'service', 'adjustment']).notNullable()
      table.string('description_ar', 240).nullable()
      table.string('description_en', 240).nullable()
      table.integer('quantity').unsigned().notNullable()
      table.bigInteger('unit_price_minor').notNullable()
      table.bigInteger('subtotal_minor').notNullable()
      table.bigInteger('discount_minor').notNullable().defaultTo(0)
      table.integer('vat_rate_bps').unsigned().notNullable()
      table.bigInteger('vat_minor').notNullable()
      table.bigInteger('total_minor').notNullable()
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table.boolean('prices_include_vat').notNullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.check('quantity > 0')
      table.check(
        'unit_price_minor >= 0 AND subtotal_minor >= 0 AND discount_minor >= 0 AND vat_minor >= 0 AND total_minor >= 0'
      )
      table.check('discount_minor <= subtotal_minor')
      table.check("currency = 'SAR'")
      table.check(`
            (item_type = 'rate_plan' AND rate_plan_id IS NOT NULL AND package_id IS NULL AND service_option_id IS NULL) OR
            (item_type = 'package' AND package_id IS NOT NULL AND rate_plan_id IS NULL AND service_option_id IS NULL) OR
            (item_type = 'service' AND service_option_id IS NOT NULL AND rate_plan_id IS NULL AND package_id IS NULL) OR
            (item_type = 'adjustment' AND rate_plan_id IS NULL AND package_id IS NULL AND service_option_id IS NULL)
          `)
      table
        .foreign(['quote_revision_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('quote_revisions')
      table
        .foreign(['rate_plan_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('rate_plans')
      table
        .foreign(['package_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('packages')
      table
        .foreign(['service_option_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('service_options')
      table.index(['quote_revision_id', 'sort_order'])
    })
  }

  async down() {
    this.schema.dropTable('quote_line_items')
  }
}
