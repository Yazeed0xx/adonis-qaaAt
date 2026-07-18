import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_operating_hours', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable()
      table.integer('space_id').unsigned().notNullable()
      table.integer('weekday').notNullable()
      table.time('opens_at_local').notNullable()
      table.time('closes_at_local').notNullable()
      table.boolean('ends_next_day').notNullable().defaultTo(false)
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.unique(['space_id', 'weekday', 'opens_at_local', 'closes_at_local'])
      table.check('weekday BETWEEN 0 AND 6')
    })
  }

  async down() {
    this.schema.dropTable('space_operating_hours')
  }
}
