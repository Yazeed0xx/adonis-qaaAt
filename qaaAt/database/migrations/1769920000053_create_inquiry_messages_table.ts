import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('inquiry_messages', (table) => {
      table.bigIncrements('id').primary()
      table.integer('inquiry_id').unsigned().notNullable().references('space_inquiries.id')
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('sender_user_id').unsigned().notNullable().references('users.id')
      table.enum('sender_type', ['customer', 'company_member']).notNullable()
      table.text('body').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['inquiry_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable('inquiry_messages')
  }
}
