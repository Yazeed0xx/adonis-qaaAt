import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'booking_audit_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('actor_user_id')
        .unsigned()
        .notNullable()
        .references('users.id')
        .onDelete('RESTRICT')
      table
        .integer('booking_id')
        .unsigned()
        .notNullable()
        .references('bookings.id')
        .onDelete('RESTRICT')
      table
        .integer('company_id')
        .unsigned()
        .notNullable()
        .references('companies.id')
        .onDelete('RESTRICT')
      table.string('action').notNullable()
      table.string('previous_status').notNullable()
      table.string('next_status').notNullable()
      table.text('reason').nullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.index(['booking_id'], 'booking_audit_logs_booking_id_index')
      table.index(['company_id', 'created_at'], 'booking_audit_logs_company_time_index')
      table.index(['actor_user_id'], 'booking_audit_logs_actor_user_id_index')
      table.index(['action'], 'booking_audit_logs_action_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
