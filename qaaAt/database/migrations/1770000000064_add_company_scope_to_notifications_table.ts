import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('notifications', (table) => {
      table
        .integer('company_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('companies')
        .onDelete('RESTRICT')
      table.index(
        ['user_id', 'company_id', 'created_at'],
        'notifications_user_company_created_index'
      )
    })
  }

  async down() {
    this.schema.alterTable('notifications', (table) => {
      table.dropIndex([], 'notifications_user_company_created_index')
      table.dropColumn('company_id')
    })
  }
}
