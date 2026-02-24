import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('user_name').notNullable().alter()
      table.timestamp('updated_at').nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('user_name').nullable().alter()
      table.timestamp('updated_at').notNullable().alter()
    })
  }
}
