import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('users', (table) => {
      table.index(['user_type', 'deleted_at'], 'users_type_deleted_index')
      table.index(['deleted_at'], 'users_deleted_at_index')
    })
  }

  async down() {
    this.schema.alterTable('users', (table) => {
      table.dropIndex(['user_type', 'deleted_at'], 'users_type_deleted_index')
      table.dropIndex(['deleted_at'], 'users_deleted_at_index')
    })
  }
}
