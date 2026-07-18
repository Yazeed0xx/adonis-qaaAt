import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'space_media_cleanup_outbox'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.integer('space_media_id').unsigned().notNullable()
      table.string('storage_key', 500).notNullable().unique()
      table.integer('attempts').unsigned().notNullable().defaultTo(0)
      table.timestamp('available_at').notNullable().defaultTo(this.now())
      table.timestamp('processed_at').nullable()
      table.text('last_error').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['processed_at', 'available_at'], 'space_media_cleanup_pending_index')
      table.check("storage_key LIKE 'spaces/%'", [], 'space_media_cleanup_key_prefix_check')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
