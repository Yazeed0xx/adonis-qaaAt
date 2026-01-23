import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('user_name').nullable()
      table.string('email', 254).notNullable().unique()
      table.enum('user_type', ["company", "user"]).notNullable()
      table.string('password').notNullable()
      

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table.index(['user_type'])
      table.index(['email'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}