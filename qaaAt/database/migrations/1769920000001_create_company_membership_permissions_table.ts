import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('company_membership_permissions', (table) => {
      table.increments('id').primary()
      table
        .integer('company_membership_id')
        .unsigned()
        .notNullable()
        .references('company_memberships.id')
        .onDelete('CASCADE')
      table.string('permission', 80).notNullable()
      table.enum('effect', ['allow', 'deny']).notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.unique(['company_membership_id', 'permission'])
    })
  }

  async down() {
    this.schema.dropTable('company_membership_permissions')
  }
}
