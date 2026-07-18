import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('rate_plans', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('space_id').unsigned().notNullable()
      table.string('name_ar', 180).nullable()
      table.string('name_en', 180).nullable()
      table
        .enum('pricing_mode', [
          'hourly',
          'fixed_session',
          'half_day',
          'full_day',
          'package',
          'custom_quote',
        ])
        .notNullable()
      table.bigInteger('price_minor').nullable()
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table.boolean('prices_include_vat').notNullable().defaultTo(false)
      table.integer('vat_rate_bps').unsigned().notNullable().defaultTo(1500)
      table.integer('minimum_duration_minutes').unsigned().nullable()
      table.integer('maximum_duration_minutes').unsigned().nullable()
      table.integer('fixed_duration_minutes').unsigned().nullable()
      table.string('session_code', 80).nullable()
      table.boolean('is_active').notNullable().defaultTo(false)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('archived_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check("currency = 'SAR'")
      table.check('price_minor IS NULL OR price_minor >= 0')
      table.check('vat_rate_bps BETWEEN 0 AND 10000')
      table.check(
        "(pricing_mode = 'custom_quote' AND price_minor IS NULL) OR (pricing_mode <> 'custom_quote' AND price_minor IS NOT NULL)"
      )
      table.check(
        "pricing_mode = 'hourly' OR (minimum_duration_minutes IS NULL AND maximum_duration_minutes IS NULL)"
      )
      table.check(
        "pricing_mode = 'fixed_session' OR (fixed_duration_minutes IS NULL AND session_code IS NULL)"
      )
      table.index(['space_id', 'is_active'])
      table.unique(['id', 'company_id'])
    })
  }

  async down() {
    this.schema.dropTable('rate_plans')
  }
}
