import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_media', (table) => {
      table.increments('id').primary()
      table.integer('space_id').unsigned().notNullable().references('spaces.id').onDelete('CASCADE')
      table.enum('media_type', ['image']).notNullable()
      table.string('storage_key', 500).notNullable()
      table.string('mime_type', 40).notNullable()
      table.bigInteger('byte_size').unsigned().notNullable()
      table.integer('width').unsigned().notNullable()
      table.integer('height').unsigned().notNullable()
      table.string('alt_text_ar', 240).nullable()
      table.string('alt_text_en', 240).nullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      table.boolean('is_cover').notNullable().defaultTo(false)
      table
        .enum('moderation_status', ['pending', 'approved', 'rejected'])
        .notNullable()
        .defaultTo('pending')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()
      table.check(
        "mime_type IN ('image/jpeg','image/png','image/webp') AND byte_size > 0 AND width > 0 AND height > 0",
        [],
        'space_media_image_metadata_check'
      )
      table.index(['space_id', 'deleted_at', 'sort_order'], 'space_media_active_order_index')
    })

    this.schema.raw(
      'CREATE UNIQUE INDEX space_media_one_cover_unique ON space_media (space_id) WHERE is_cover = true AND deleted_at IS NULL'
    )
  }

  async down() {
    this.schema.dropTable('space_media')
  }
}
