import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_availability_policies', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable()
      table.integer('space_id').unsigned().notNullable().unique()
      table.enum('mode', ['hourly', 'session', 'full_day', 'multi_day']).notNullable()
      table.integer('slot_increment_minutes').unsigned().notNullable().defaultTo(60)
      table.integer('minimum_duration_minutes').unsigned().notNullable().defaultTo(60)
      table.integer('maximum_duration_minutes').unsigned().notNullable().defaultTo(720)
      table.integer('minimum_notice_minutes').unsigned().notNullable().defaultTo(0)
      table.integer('maximum_advance_days').unsigned().notNullable().defaultTo(365)
      table.integer('preparation_buffer_minutes').unsigned().notNullable().defaultTo(0)
      table.integer('cleanup_buffer_minutes').unsigned().notNullable().defaultTo(0)
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check('minimum_duration_minutes <= maximum_duration_minutes')
      table.check('slot_increment_minutes > 0')
    })
  }

  async down() {
    this.schema.dropTable('space_availability_policies')
  }
}
