import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('category_request_response_policies', (table) => {
      table.increments('id').primary()
      table
        .integer('category_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('space_categories.id')
      table.integer('request_to_book_hours').unsigned().notNullable().defaultTo(168)
      table.integer('date_inquiry_hours').unsigned().notNullable().defaultTo(168)
      table.integer('visit_hours').unsigned().notNullable().defaultTo(72)
      table.integer('quote_hold_hours').unsigned().notNullable().defaultTo(48)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.check('quote_hold_hours BETWEEN 1 AND 72', [], 'category_quote_hold_hours_check')
    })
  }

  async down() {
    this.schema.dropTable('category_request_response_policies')
  }
}
