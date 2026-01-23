
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bookings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.date('booking_date').notNullable()
      table.time('start_time').notNullable()
      table.time('end_time').notNullable()
      table.enum('status', ['pending', 'confirmed', 'cancelled', 'completed']).notNullable().defaultTo('pending')
      table.decimal('total_price', 10, 2).notNullable()
      table.text('special_requests').nullable()
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .integer('hall_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('halls')
        .onDelete('RESTRICT')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table.index(['user_id'])
      table.index(['hall_id'])
      table.index(['booking_date'])
      table.index(['status'])
      table.index(['hall_id', 'booking_date', 'start_time', 'end_time'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}