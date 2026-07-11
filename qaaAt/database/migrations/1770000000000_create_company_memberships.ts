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

    this.schema.createTable('company_membership_permissions', (table) => {
      table.increments('id').primary()
      table
        .integer('company_membership_id')
        .unsigned()
        .notNullable()
        .references('company_memberships.id')
        .onDelete('CASCADE')
      table.string('permission', 80).notNullable()
      table.enum('effect', ['allow', 'deny']).notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.unique(['company_membership_id', 'permission'])
    })

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

    this.schema.createTable('company_audit_logs', (table) => {
      table.bigIncrements('id').primary()
      table
        .integer('company_id')
        .unsigned()
        .notNullable()
        .references('companies.id')
        .onDelete('RESTRICT')
      table
        .integer('actor_user_id')
        .unsigned()
        .nullable()
        .references('users.id')
        .onDelete('SET NULL')
      table.string('action', 100).notNullable()
      table.string('target_type', 80).notNullable()
      table.integer('target_id').unsigned().notNullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['company_id', 'created_at'])
      table.index(['target_type', 'target_id'])
    })
  }

  async down() {
    this.schema.dropTable('company_audit_logs')
    this.schema.dropTable('company_invitations')
    this.schema.dropTable('company_membership_permissions')
    this.schema.dropTable('company_memberships')
  }
}
