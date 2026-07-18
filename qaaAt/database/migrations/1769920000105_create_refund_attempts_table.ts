import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('refund_attempts', (table) => {
      table.bigIncrements('id').primary()
      table.uuid('reference').notNullable().unique()
      table.bigInteger('refund_id').notNullable().references('refunds.id')
      table.string('provider', 40).notNullable()
      table.string('idempotency_key', 180).notNullable()
      table.string('request_fingerprint', 64).notNullable()
      table.bigInteger('requested_amount_minor').notNullable()
      table.string('currency', 3).notNullable()
      table.string('provider_refund_reference', 180).nullable()
      table
        .enum('status', ['created', 'provider_pending', 'succeeded', 'failed', 'unknown'])
        .notNullable()
        .defaultTo('created')
      table.string('failure_code', 100).nullable()
      table.string('failure_message', 240).nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('processed_at').nullable()
      table.unique(['refund_id', 'provider', 'idempotency_key'])
      table.unique(['provider', 'provider_refund_reference'])
      table.unique(['id', 'refund_id'])
      table.check('requested_amount_minor >= 0')
      table.check("currency = 'SAR'")
    })
  }

  async down() {
    this.schema.dropTable('refund_attempts')
  }
}
