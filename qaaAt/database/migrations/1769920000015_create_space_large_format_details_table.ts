import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_large_format_details', (table) => {
      table.integer('space_id').unsigned().primary().references('spaces.id').onDelete('CASCADE')
      table.decimal('floor_area_sqm', 10, 2).nullable()
      table.decimal('ceiling_height_m', 6, 2).nullable()
      table.boolean('has_loading_access').nullable()
      table.integer('visitor_capacity').unsigned().nullable()
      table.string('power_requirement', 120).nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.check(
        '(floor_area_sqm IS NULL OR floor_area_sqm > 0)',
        [],
        'space_large_floor_area_check'
      )
      table.check(
        '(ceiling_height_m IS NULL OR ceiling_height_m > 0)',
        [],
        'space_large_ceiling_height_check'
      )
    })
  }

  async down() {
    this.schema.dropTable('space_large_format_details')
  }
}
