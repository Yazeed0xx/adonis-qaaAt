import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('companies', (table) => {
      table.index(['deleted_at'], 'companies_deleted_at_index')
      table.index(['user_id'], 'companies_user_id_index')
    })
  }

  async down() {
    this.schema.alterTable('companies', (table) => {
      table.dropIndex(['deleted_at'], 'companies_deleted_at_index')
      table.dropIndex(['user_id'], 'companies_user_id_index')
    })
  }
}
