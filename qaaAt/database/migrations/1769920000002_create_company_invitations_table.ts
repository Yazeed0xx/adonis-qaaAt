import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('company_invitations', (table) => {
      table.increments('id').primary()
      table
        .integer('company_id')
        .unsigned()
        .notNullable()
        .references('companies.id')
        .onDelete('CASCADE')
      table.string('name', 120).notNullable()
      table.string('invited_phone', 20).nullable()
      table.string('invited_email', 254).nullable()
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
      table.jsonb('permission_overrides').nullable()
      table.string('token_hash', 64).notNullable().unique()
      table
        .enum('status', ['pending', 'accepted', 'expired', 'cancelled'])
        .notNullable()
        .defaultTo('pending')
      table
        .integer('invited_by_user_id')
        .unsigned()
        .notNullable()
        .references('users.id')
        .onDelete('RESTRICT')
      table
        .integer('accepted_by_user_id')
        .unsigned()
        .nullable()
        .references('users.id')
        .onDelete('SET NULL')
      table.timestamp('expires_at').notNullable()
      table.timestamp('accepted_at').nullable()
      table.timestamp('cancelled_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.index(['company_id', 'status'])
      table.index(['invited_email', 'status'])
      table.index(['invited_phone', 'status'])
      table.check(
        '(invited_email IS NOT NULL OR invited_phone IS NOT NULL)',
        [],
        'company_invitations_contact_check'
      )
    })
  }

  async down() {
    this.schema.dropTable('company_invitations')
  }
}
