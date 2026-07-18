import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('availability_exceptions', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable()
      table.integer('space_id').unsigned().notNullable()
      table.date('local_date').notNullable()
      table.enum('kind', ['closed', 'modified_hours', 'open_override']).notNullable()
      table.time('starts_at_local').nullable()
      table.time('ends_at_local').nullable()
      table.boolean('ends_next_day').notNullable().defaultTo(false)
      table.text('reason').nullable()
      table.integer('created_by_user_id').unsigned().nullable().references('users.id')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.index(['space_id', 'local_date'])
    })
  }

  async down() {
    this.schema.dropTable('availability_exceptions')
  }
}
