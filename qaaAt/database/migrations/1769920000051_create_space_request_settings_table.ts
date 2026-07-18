import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_request_settings', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable()
      table.integer('space_id').unsigned().notNullable().unique()
      table.integer('booking_response_hours').unsigned().nullable()
      table.integer('inquiry_response_hours').unsigned().nullable()
      table.integer('visit_response_hours').unsigned().nullable()
      table.integer('quote_hold_hours').unsigned().nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check('booking_response_hours IS NULL OR booking_response_hours BETWEEN 1 AND 720')
      table.check('inquiry_response_hours IS NULL OR inquiry_response_hours BETWEEN 1 AND 720')
      table.check('visit_response_hours IS NULL OR visit_response_hours BETWEEN 1 AND 720')
      table.check(
        'quote_hold_hours IS NULL OR quote_hold_hours BETWEEN 1 AND 72',
        [],
        'space_quote_hold_hours_check'
      )
    })
  }

  async down() {
    this.schema.dropTable('space_request_settings')
  }
}
