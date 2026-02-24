import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bookings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('rejection_reason').nullable()
      table.timestamp('company_responded_at').nullable()
      table.timestamp('expires_at').nullable()
      table.enum('payment_status', ['unpaid', 'paid', 'refunded']).notNullable().defaultTo('unpaid')
      table.timestamp('payment_due_date').nullable()

      table.index(['expires_at'])
      table.index(['payment_status'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['expires_at'])
      table.dropIndex(['payment_status'])
      table.dropColumn('rejection_reason')
      table.dropColumn('company_responded_at')
      table.dropColumn('expires_at')
      table.dropColumn('payment_status')
      table.dropColumn('payment_due_date')
    })
  }
}
