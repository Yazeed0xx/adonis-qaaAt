import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('request_idempotency_keys', (table) => {
      table.bigIncrements('id').primary()
      table.integer('user_id').unsigned().notNullable().references('users.id')
      table.enum('scope', ['booking_create', 'inquiry_create', 'visit_create']).notNullable()
      table.string('idempotency_key', 120).notNullable()
      table.string('request_hash', 64).notNullable()
      table.string('resource_type', 40).notNullable()
      table.integer('resource_id').unsigned().notNullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.unique(['user_id', 'scope', 'idempotency_key'])
      table.index(['expires_at'])
    })
  }

  async down() {
    this.schema.dropTable('request_idempotency_keys')
  }
}
