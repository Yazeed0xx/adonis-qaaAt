import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('notification_outbox', (table) => {
      table.bigIncrements('id').primary()
      table.jsonb('payload').notNullable()
      table.integer('attempts').notNullable().defaultTo(0)
      table.timestamp('available_at').notNullable().defaultTo(this.now())
      table.timestamp('processed_at').nullable()
      table.text('last_error').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['processed_at', 'available_at'], 'notification_outbox_pending_index')
    })

    this.schema.alterTable('notifications', (table) => {
      table.bigInteger('outbox_id').nullable().unique()
    })
  }

  async down() {
    this.schema.alterTable('notifications', (table) => table.dropColumn('outbox_id'))
    this.schema.dropTable('notification_outbox')
  }
}
