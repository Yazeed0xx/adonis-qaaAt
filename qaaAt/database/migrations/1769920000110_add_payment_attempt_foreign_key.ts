import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('payments', (table) => {
      table
        .foreign(['latest_successful_attempt_id', 'id'], 'payments_latest_attempt_fk')
        .references(['id', 'payment_id'])
        .inTable('payment_attempts')
    })
  }

  async down() {
    this.schema.alterTable('payments', (table) => {
      table.dropForeign([], 'payments_latest_attempt_fk')
    })
  }
}
