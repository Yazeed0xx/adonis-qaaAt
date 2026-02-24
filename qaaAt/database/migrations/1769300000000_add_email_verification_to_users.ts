import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('email_verified_at').nullable()
      table.string('email_verification_token', 64).nullable()
      table.timestamp('email_verification_expires_at').nullable()

      table.index(['email_verification_token'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['email_verification_token'])
      table.dropColumn('email_verified_at')
      table.dropColumn('email_verification_token')
      table.dropColumn('email_verification_expires_at')
    })
  }
}
