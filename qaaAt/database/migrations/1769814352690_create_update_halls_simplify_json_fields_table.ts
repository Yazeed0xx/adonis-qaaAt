import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'halls'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('additional_services')
      table.dropColumn('additional_features')
      table.dropColumn('additional_amenities')
      table.dropColumn('additional_equipments')
      table.dropColumn('additional_facilities')

      table.jsonb('services').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('services')

      table.jsonb('additional_services').nullable()
      table.jsonb('additional_features').nullable()
      table.jsonb('additional_amenities').nullable()
      table.jsonb('additional_equipments').nullable()
      table.jsonb('additional_facilities').nullable()
    })
  }
}
