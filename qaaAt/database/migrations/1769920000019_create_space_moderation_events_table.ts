import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_moderation_events', (table) => {
      table.bigIncrements('id').primary()
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
      table.string('previous_status', 40).nullable()
      table.string('next_status', 40).notNullable()
      table.text('reason').nullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['space_id', 'created_at'])
      table.index(['company_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable('space_moderation_events')
  }
}
