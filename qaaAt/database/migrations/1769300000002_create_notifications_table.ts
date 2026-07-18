import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'notifications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('type', 50).notNullable() // booking_accepted, booking_rejected, company_approved, etc.
      table.string('title', 255).notNullable()
      table.text('message').notNullable()
      table.jsonb('data').nullable()
      table.timestamp('read_at').nullable()
      table.timestamp('created_at').notNullable()

      table.index(['user_id'])
      table.index(['user_id', 'read_at'])
      table.index(['type'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
