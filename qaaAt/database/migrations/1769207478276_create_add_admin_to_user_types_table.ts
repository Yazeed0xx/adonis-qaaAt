import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    await this.db.rawQuery(
      `ALTER TABLE ${this.tableName} DROP CONSTRAINT IF EXISTS users_user_type_check`
    )
    await this.db.rawQuery(
      `ALTER TABLE ${this.tableName} ADD CONSTRAINT users_user_type_check CHECK (user_type IN ('user', 'company', 'admin'))`
    )
  }

  async down() {
    await this.db.rawQuery(
      `UPDATE ${this.tableName} SET user_type = 'user' WHERE user_type = 'admin'`
    )
    await this.db.rawQuery(
      `ALTER TABLE ${this.tableName} DROP CONSTRAINT IF EXISTS users_user_type_check`
    )
    await this.db.rawQuery(
      `ALTER TABLE ${this.tableName} ADD CONSTRAINT users_user_type_check CHECK (user_type IN ('user', 'company'))`
    )
  }
}
