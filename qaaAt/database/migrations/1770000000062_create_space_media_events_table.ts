import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'space_media_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.integer('space_media_id').unsigned().notNullable()
      table
        .integer('space_id')
        .unsigned()
        .notNullable()
        .references('spaces.id')
        .onDelete('RESTRICT')
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
      table.string('action', 80).notNullable()
      table.string('previous_status', 20).nullable()
      table.string('next_status', 20).nullable()
      table.string('reason', 500).nullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['space_media_id', 'created_at'])
      table.index(['company_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
