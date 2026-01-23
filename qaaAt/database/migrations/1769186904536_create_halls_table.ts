import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'halls'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('name').notNullable()
      table.text('description').nullable()
      table.integer('capacity').unsigned().notNullable()
      table.text('location').notNullable()
      table.json('amenities').nullable()
      table.decimal('pricing', 10, 2).notNullable()
      table.json('images').nullable()
      table.string("address").notNullable()
      table.string("city").notNullable()
      table.json("additional_services").nullable()
      table.json("additional_features").nullable()
      table.json("additional_amenities").nullable()
      table.json("additional_equipments").nullable()
      table.json("additional_facilities").nullable()
    
      table.boolean('is_available').defaultTo(true).notNullable()
      table
        .integer('company_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('companies')
        .onDelete('CASCADE')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table.index(['company_id'])
      table.index(['is_available'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}