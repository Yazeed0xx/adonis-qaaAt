import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_amenities', (table) => {
      table.increments('id').primary()
      table.integer('space_id').unsigned().notNullable().references('spaces.id').onDelete('CASCADE')
      table
        .integer('amenity_definition_id')
        .unsigned()
        .notNullable()
        .references('amenity_definitions.id')
        .onDelete('RESTRICT')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.unique(['space_id', 'amenity_definition_id'])
    })
  }

  async down() {
    this.schema.dropTable('space_amenities')
  }
}
