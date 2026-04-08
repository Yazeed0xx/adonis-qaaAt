import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'companies'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('status', ['pending', 'approved', 'rejected', 'suspended'])
        .notNullable()
        .defaultTo('pending')
      table.timestamp('approved_at').nullable()
      table
        .integer('approved_by')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.text('rejection_reason').nullable()
      table.timestamp('rejected_at').nullable()

      table.index(['status'])
    })
  }

  async down() {
    await this.db.rawQuery('DROP INDEX IF EXISTS companies_status_index')

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('status')
      table.dropColumn('approved_at')
      table.dropColumn('approved_by')
      table.dropColumn('rejection_reason')
      table.dropColumn('rejected_at')
    })
  }
}
