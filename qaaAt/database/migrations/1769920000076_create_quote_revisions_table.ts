import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('quote_revisions', (table) => {
      table.increments('id').primary()
      table.integer('quote_id').unsigned().notNullable().references('quotes.id')
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('revision_number').unsigned().notNullable()
      table.enum('status', ['draft', 'sent', 'superseded']).notNullable().defaultTo('draft')
      table.bigInteger('subtotal_minor').notNullable().defaultTo(0)
      table.bigInteger('discount_minor').notNullable().defaultTo(0)
      table.bigInteger('vat_minor').notNullable().defaultTo(0)
      table.bigInteger('total_minor').notNullable().defaultTo(0)
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table.boolean('prices_include_vat').notNullable().defaultTo(false)
      table.integer('vat_rate_bps').unsigned().notNullable().defaultTo(1500)
      table.integer('deposit_percent').unsigned().nullable()
      table.bigInteger('deposit_minor').nullable()
      table.bigInteger('remaining_minor').nullable()
      table.timestamp('expires_at').nullable()
      table
        .integer('created_by_membership_id')
        .unsigned()
        .notNullable()
        .references('company_memberships.id')
      table
        .integer('sent_by_membership_id')
        .unsigned()
        .nullable()
        .references('company_memberships.id')
      table.timestamp('sent_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.unique(['quote_id', 'revision_number'])
      table.check("currency = 'SAR'")
      table.check(
        'subtotal_minor >= 0 AND discount_minor >= 0 AND vat_minor >= 0 AND total_minor >= 0'
      )
      table.check('discount_minor <= subtotal_minor')
      table.check('deposit_percent IS NULL OR deposit_percent BETWEEN 0 AND 100')
      table.index(['quote_id', 'status'])
      table.unique(['id', 'quote_id'])
      table.unique(['id', 'company_id'])
    })
  }

  async down() {
    this.schema.dropTable('quote_revisions')
  }
}
