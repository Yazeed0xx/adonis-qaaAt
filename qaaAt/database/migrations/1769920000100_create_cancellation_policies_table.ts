import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('cancellation_policies', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.string('name', 160).notNullable()
      table.integer('version').unsigned().notNullable()
      table.boolean('is_active').notNullable().defaultTo(false)
      table.boolean('deposit_non_refundable').notNullable().defaultTo(false)
      table.jsonb('tiers').notNullable()
      table
        .integer('created_by_membership_id')
        .unsigned()
        .notNullable()
        .references('company_memberships.id')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('archived_at').nullable()
      table.unique(['company_id', 'version'])
      table.unique(['id', 'company_id'])
      table.unique(['id', 'company_id', 'version'])
    })
  }

  async down() {
    this.schema.dropTable('cancellation_policies')
  }
}
