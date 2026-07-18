import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('packages', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('space_id').unsigned().notNullable()
      table.string('name_ar', 180).nullable()
      table.string('name_en', 180).nullable()
      table.text('description_ar').nullable()
      table.text('description_en').nullable()
      table.bigInteger('base_price_minor').notNullable()
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table.boolean('prices_include_vat').notNullable().defaultTo(false)
      table.integer('vat_rate_bps').unsigned().notNullable().defaultTo(1500)
      table.boolean('is_active').notNullable().defaultTo(false)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('archived_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check("currency = 'SAR'")
      table.check('base_price_minor >= 0')
      table.check('vat_rate_bps BETWEEN 0 AND 10000')
      table.check('name_ar IS NOT NULL OR name_en IS NOT NULL')
      table.index(['space_id', 'is_active'])
      table.unique(['id', 'company_id'])
    })
  }

  async down() {
    this.schema.dropTable('packages')
  }
}
