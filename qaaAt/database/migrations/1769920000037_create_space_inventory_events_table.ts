import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_inventory_events', (table) => {
      table.bigIncrements('id').primary()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('space_id').unsigned().notNullable().references('spaces.id')
      table
        .bigInteger('inventory_block_id')
        .unsigned()
        .nullable()
        .references('space_inventory_blocks.id')
      table.integer('actor_user_id').unsigned().nullable().references('users.id')
      table.string('action', 100).notNullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['space_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable('space_inventory_events')
  }
}
