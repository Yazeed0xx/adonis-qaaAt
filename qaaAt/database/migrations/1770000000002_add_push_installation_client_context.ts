import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('push_installations', (table) => {
      table.enum('client_context', ['customer_app', 'company_app']).nullable()
      table.index(
        ['user_id', 'client_context', 'notifications_enabled'],
        'push_installations_user_context_index'
      )
    })
    this.schema.raw(
      "UPDATE push_installations SET client_context = CASE WHEN EXISTS (SELECT 1 FROM users WHERE users.id = push_installations.user_id AND users.user_type = 'company') THEN 'company_app' ELSE 'customer_app' END"
    )
  }

  async down() {
    this.schema.alterTable('push_installations', (table) => {
      table.dropIndex([], 'push_installations_user_context_index')
      table.dropColumn('client_context')
    })
  }
}
