import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
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
  }
}
