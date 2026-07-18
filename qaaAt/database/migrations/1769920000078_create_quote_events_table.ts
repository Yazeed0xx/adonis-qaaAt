import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('quote_events', (table) => {
      table.bigIncrements('id').primary()
      table.integer('quote_id').unsigned().notNullable().references('quotes.id')
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('actor_user_id').unsigned().nullable().references('users.id')
      table.string('action', 100).notNullable()
      table.string('previous_status', 40).nullable()
      table.string('next_status', 40).notNullable()
      table.integer('quote_revision_id').unsigned().nullable()
      table.text('reason').nullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['quote_id', 'created_at'])
      table.foreign(['quote_id', 'company_id']).references(['id', 'company_id']).inTable('quotes')
      table
        .foreign(['quote_revision_id', 'quote_id'])
        .references(['id', 'quote_id'])
        .inTable('quote_revisions')
    })
  }

  async down() {
    this.schema.dropTable('quote_events')
  }
}
