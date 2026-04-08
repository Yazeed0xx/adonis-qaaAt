import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    await this.db.rawQuery(
      `UPDATE ${this.tableName} SET user_name = split_part(email, '@', 1) WHERE user_name IS NULL`
    )

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
