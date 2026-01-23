import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('user_type')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.enum('user_type', ['user', 'company', 'admin']).notNullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('user_type')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.enum('user_type', ['user', 'company']).notNullable()
    })
  }
}