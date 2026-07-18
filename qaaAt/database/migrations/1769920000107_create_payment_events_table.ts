import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('payment_events', (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('payment_id').nullable().references('payments.id')
      table.bigInteger('refund_id').nullable().references('refunds.id')
      table.integer('booking_id').unsigned().nullable().references('bookings.id')
      table.integer('company_id').unsigned().nullable().references('companies.id')
      table.integer('actor_user_id').unsigned().nullable().references('users.id')
      table.string('action', 100).notNullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['payment_id', 'created_at'])
      table.index(['refund_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable('payment_events')
  }
}
