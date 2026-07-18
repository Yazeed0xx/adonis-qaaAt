import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('booking_cancellation_idempotency', (table) => {
      table.bigIncrements('id').primary()
      table.integer('actor_user_id').unsigned().notNullable().references('users.id')
      table.enum('actor_scope', ['customer', 'company']).notNullable()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('booking_id').unsigned().notNullable().references('bookings.id')
      table.bigInteger('payment_id').notNullable().references('payments.id')
      table.bigInteger('refund_id').nullable().references('refunds.id')
      table.string('idempotency_key', 180).notNullable()
      table.string('request_fingerprint', 64).notNullable()
      table.bigInteger('refundable_amount_minor').notNullable()
      table.jsonb('result_snapshot').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.unique(['actor_user_id', 'actor_scope', 'idempotency_key'])
      table.check('refundable_amount_minor >= 0')
    })
  }

  async down() {
    this.schema.dropTable('booking_cancellation_idempotency')
  }
}
