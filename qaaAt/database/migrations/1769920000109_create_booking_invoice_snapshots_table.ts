import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('booking_invoice_snapshots', (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('payment_id').notNullable().unique().references('payments.id')
      table.integer('booking_id').unsigned().notNullable().references('bookings.id')
      table.jsonb('snapshot').notNullable()
      table.bigInteger('amount_refunded_minor').notNullable().defaultTo(0)
      table
        .enum('status', ['receipt_available', 'partially_refunded', 'refunded'])
        .notNullable()
        .defaultTo('receipt_available')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.check('amount_refunded_minor >= 0')
      table
        .foreign(['payment_id', 'booking_id'])
        .references(['id', 'booking_id'])
        .inTable('payments')
    })
  }

  async down() {
    this.schema.dropTable('booking_invoice_snapshots')
  }
}
