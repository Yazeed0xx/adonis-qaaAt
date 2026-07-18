import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('refunds', (table) => {
      table.bigIncrements('id').primary()
      table.uuid('reference').notNullable().unique()
      table.bigInteger('payment_id').notNullable()
      table.integer('booking_id').unsigned().notNullable()
      table.integer('company_id').unsigned().notNullable()
      table.integer('user_id').unsigned().notNullable().references('users.id')
      table.bigInteger('requested_amount_minor').notNullable()
      table.bigInteger('approved_amount_minor').notNullable()
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table.text('reason').notNullable()
      table.string('source_cancellation_event', 100).notNullable()
      table
        .enum('status', ['requested', 'provider_pending', 'succeeded', 'failed', 'cancelled'])
        .notNullable()
        .defaultTo('requested')
      table.string('provider_refund_reference', 180).nullable()
      table.string('idempotency_key', 180).notNullable()
      table.integer('actor_user_id').unsigned().nullable().references('users.id')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('processed_at').nullable()
      table.unique(['payment_id', 'idempotency_key'])
      table.unique(['provider_refund_reference'])
      table
        .foreign(['payment_id', 'booking_id'])
        .references(['id', 'booking_id'])
        .inTable('payments')
      table
        .foreign(['payment_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('payments')
      table
        .foreign(['payment_id', 'user_id', 'company_id', 'booking_id'])
        .references(['id', 'user_id', 'company_id', 'booking_id'])
        .inTable('payments')
      table.check("currency = 'SAR'")
      table.check(
        'requested_amount_minor >= 0 AND approved_amount_minor >= 0 AND approved_amount_minor <= requested_amount_minor'
      )
    })
  }

  async down() {
    this.schema.dropTable('refunds')
  }
}
