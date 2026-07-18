import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('venues', (table) => {
      table.increments('id').primary()
      table
        .integer('company_id')
        .unsigned()
        .notNullable()
        .references('companies.id')
        .onDelete('RESTRICT')
      table.string('name_ar', 180).nullable()
      table.string('name_en', 180).nullable()
      table.string('city', 120).notNullable()
      table.string('district', 120).nullable()
      table.string('street', 180).nullable()
      table.string('building_number', 40).nullable()
      table.string('postal_code', 20).nullable()
      table.string('additional_number', 40).nullable()
      table.string('timezone', 100).notNullable().defaultTo('Asia/Riyadh')
      table.text('access_instructions_ar').nullable()
      table.text('access_instructions_en').nullable()
      table.text('parking_notes_ar').nullable()
      table.text('parking_notes_en').nullable()
      table.decimal('latitude', 10, 7).nullable()
      table.decimal('longitude', 10, 7).nullable()
      table
        .enum('verification_status', ['unverified', 'verified', 'rejected'])
        .notNullable()
        .defaultTo('unverified')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()
      table.unique(['id', 'company_id'], { indexName: 'venues_id_company_unique' })
      table.index(['company_id', 'deleted_at'])
      table.check('(name_ar IS NOT NULL OR name_en IS NOT NULL)', [], 'venues_name_required_check')
      table.check('(latitude IS NULL OR latitude BETWEEN -90 AND 90)', [], 'venues_latitude_check')
      table.check(
        '(longitude IS NULL OR longitude BETWEEN -180 AND 180)',
        [],
        'venues_longitude_check'
      )
    })
  }

  async down() {
    this.schema.dropTable('venues')
  }
}
