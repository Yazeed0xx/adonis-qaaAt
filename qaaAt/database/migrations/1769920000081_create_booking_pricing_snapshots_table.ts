import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('booking_pricing_snapshots', (table) => {
      table.bigIncrements('id').primary()
      table.integer('booking_id').unsigned().notNullable().unique().references('bookings.id')
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('space_id').unsigned().notNullable()
      table.integer('rate_plan_id').unsigned().notNullable().references('rate_plans.id')
      table
        .enum('pricing_mode', ['hourly', 'fixed_session', 'half_day', 'full_day', 'package'])
        .notNullable()
      table.jsonb('line_items').notNullable()
      table.bigInteger('subtotal_minor').notNullable()
      table.bigInteger('discount_minor').notNullable().defaultTo(0)
      table.bigInteger('vat_minor').notNullable()
      table.bigInteger('total_minor').notNullable()
      table.boolean('prices_include_vat').notNullable()
      table.integer('vat_rate_bps').unsigned().notNullable()
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check("currency = 'SAR'")
      table.check(
        'subtotal_minor >= 0 AND discount_minor >= 0 AND vat_minor >= 0 AND total_minor >= 0'
      )
      table.check('discount_minor <= subtotal_minor')
      table.check('vat_rate_bps BETWEEN 0 AND 10000')
    })
  }

  async down() {
    this.schema.dropTable('booking_pricing_snapshots')
  }
}
