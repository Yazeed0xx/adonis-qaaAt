import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('amenity_definitions', (table) => {
      table.increments('id').primary()
      table.string('slug', 80).notNullable().unique()
      table.string('name_ar', 120).notNullable()
      table.string('name_en', 120).notNullable()
      table.string('group', 80).notNullable()
      table.boolean('is_searchable').notNullable().defaultTo(true)
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable('amenity_definitions')
  }
}
