import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_event_details', (table) => {
      table.integer('space_id').unsigned().primary().references('spaces.id').onDelete('CASCADE')
      table.integer('male_capacity').unsigned().nullable()
      table.integer('female_capacity').unsigned().nullable()
      table.boolean('has_separate_entrances').nullable()
      table.boolean('has_bridal_room').nullable()
      table.boolean('has_stage').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable('space_event_details')
  }
}
