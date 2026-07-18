import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_layout_capacities', (table) => {
      table.increments('id').primary()
      table.integer('space_id').unsigned().notNullable().references('spaces.id').onDelete('CASCADE')
      table
        .enum('layout', [
          'boardroom',
          'classroom',
          'theater',
          'u_shape',
          'banquet',
          'standing',
          'cabaret',
        ])
        .notNullable()
      table.integer('capacity').unsigned().notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.unique(['space_id', 'layout'])
      table.check('capacity > 0', [], 'space_layout_capacity_positive_check')
    })
  }

  async down() {
    this.schema.dropTable('space_layout_capacities')
  }
}
