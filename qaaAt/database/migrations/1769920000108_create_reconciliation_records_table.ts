import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('reconciliation_records', (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('payment_id').nullable().references('payments.id')
      table.integer('company_id').unsigned().nullable().references('companies.id')
      table.string('provider', 40).notNullable()
      table.string('provider_reference', 180).notNullable()
      table.bigInteger('expected_amount_minor').nullable()
      table.bigInteger('reported_amount_minor').nullable()
      table.string('expected_currency', 3).nullable()
      table.string('reported_currency', 3).nullable()
      table.string('internal_status', 60).nullable()
      table.string('provider_status', 60).nullable()
      table
        .enum('result', [
          'matched',
          'amount_mismatch',
          'currency_mismatch',
          'unknown_provider_reference',
          'late_success',
          'refund_mismatch',
          'unresolved',
        ])
        .notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('last_checked_at').notNullable().defaultTo(this.now())
      table.timestamp('resolved_at').nullable()
      table.text('resolution_reason').nullable()
    })
  }

  async down() {
    this.schema.dropTable('reconciliation_records')
  }
}
