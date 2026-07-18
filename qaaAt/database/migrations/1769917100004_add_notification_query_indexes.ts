import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('notifications', (table) => {
      table.index(['user_id', 'read_at', 'created_at'], 'notifications_user_read_index')
    })
  }

  async down() {
    this.schema.alterTable('notifications', (table) => {
      table.dropIndex(['user_id', 'read_at', 'created_at'], 'notifications_user_read_index')
    })
  }
}
