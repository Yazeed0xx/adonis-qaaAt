import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('bookings', (table) => {
      table
        .foreign(['cancellation_policy_version_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('cancellation_policies')
    })
  }

  async down() {
    this.schema.alterTable('bookings', (table) => {
      table.dropForeign(['cancellation_policy_version_id', 'company_id'])
    })
  }
}
