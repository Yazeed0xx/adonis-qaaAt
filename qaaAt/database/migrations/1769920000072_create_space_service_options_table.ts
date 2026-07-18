import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_service_options', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('space_id').unsigned().notNullable()
      table.integer('service_option_id').unsigned().notNullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table
        .foreign(['service_option_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('service_options')
      table.unique(['space_id', 'service_option_id'])
    })
  }

  async down() {
    this.schema.dropTable('space_service_options')
  }
}
