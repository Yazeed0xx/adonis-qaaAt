import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_availability_sessions', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable()
      table.integer('space_id').unsigned().notNullable()
      table.string('code', 80).notNullable()
      table.string('name_ar', 120).nullable()
      table.string('name_en', 120).nullable()
      table.integer('weekday').notNullable()
      table.time('starts_at_local').notNullable()
      table.time('ends_at_local').notNullable()
      table.boolean('ends_next_day').notNullable().defaultTo(false)
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.unique(['space_id', 'code', 'weekday'])
      table.check('weekday BETWEEN 0 AND 6')
      table.check('(name_ar IS NOT NULL OR name_en IS NOT NULL)')
    })
  }

  async down() {
    this.schema.dropTable('space_availability_sessions')
  }
}
