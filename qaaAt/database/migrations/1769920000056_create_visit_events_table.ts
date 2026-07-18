import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('visit_events', (table) => {
      table.bigIncrements('id').primary()
      table.integer('visit_id').unsigned().notNullable().references('visit_requests.id')
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('actor_user_id').unsigned().nullable().references('users.id')
      table.string('action', 100).notNullable()
      table.string('previous_status', 40).nullable()
      table.string('next_status', 40).notNullable()
      table.text('reason').nullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['visit_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable('visit_events')
  }
}
