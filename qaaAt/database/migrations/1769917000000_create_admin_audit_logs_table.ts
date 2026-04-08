import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'admin_audit_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('admin_user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.string('action').notNullable()
      table.string('target_type').notNullable()
      table.integer('target_id').unsigned().notNullable()
      table.text('reason').nullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').defaultTo(this.now())

      table.index(['admin_user_id'], 'admin_audit_logs_admin_user_id_index')
      table.index(['target_type', 'target_id'], 'admin_audit_logs_target_index')
      table.index(['action'], 'admin_audit_logs_action_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
