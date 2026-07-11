import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('push_installations', (table) => {
      table.bigIncrements('id').primary()
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('installation_id', 128).notNullable().unique()
      table.string('expo_push_token', 255).notNullable()
      table.string('platform', 10).notNullable()
      table.string('device_name', 120).nullable()
      table.string('app_version', 40).nullable()
      table.boolean('notifications_enabled').notNullable().defaultTo(true)
      table.timestamp('last_seen_at').notNullable().defaultTo(this.now())
      table.timestamp('revoked_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()

      table.check("platform IN ('ios', 'android')")
      table.index(
        ['user_id', 'notifications_enabled', 'revoked_at'],
        'push_installations_active_user_index'
      )
    })

    this.schema.raw(
      'CREATE UNIQUE INDEX push_installations_active_token_unique ON push_installations (expo_push_token) WHERE revoked_at IS NULL'
    )
  }

  async down() {
    this.schema.dropTable('push_installations')
  }
}
