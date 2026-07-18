import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('company_memberships', (table) => {
      table.increments('id').primary()
      table
        .integer('company_id')
        .unsigned()
        .notNullable()
        .references('companies.id')
        .onDelete('CASCADE')
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('RESTRICT')
      table
        .enum('role', [
          'owner',
          'manager',
          'booking_staff',
          'calendar_staff',
          'accountant',
          'viewer',
        ])
        .notNullable()
      table.enum('status', ['active', 'suspended', 'revoked']).notNullable().defaultTo('active')
      table
        .integer('invited_by_user_id')
        .unsigned()
        .nullable()
        .references('users.id')
        .onDelete('SET NULL')
      table.timestamp('joined_at').notNullable().defaultTo(this.now())
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.unique(['company_id', 'user_id'])
      table.index(['company_id', 'status'])
      table.index(['user_id', 'status'])
    })
  }

  async down() {
    this.schema.dropTable('company_memberships')
  }
}
