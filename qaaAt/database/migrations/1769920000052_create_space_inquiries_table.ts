import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_inquiries', (table) => {
      table.increments('id').primary()
      table.string('reference', 40).notNullable().unique()
      table.integer('company_id').unsigned().notNullable()
      table.integer('venue_id').unsigned().notNullable().references('venues.id')
      table.integer('space_id').unsigned().notNullable()
      table.integer('user_id').unsigned().notNullable().references('users.id')
      table.enum('kind', ['date_inquiry']).notNullable().defaultTo('date_inquiry')
      table
        .enum('status', [
          'open',
          'under_review',
          'answered',
          'closed',
          'cancelled',
          'rejected',
          'expired',
        ])
        .notNullable()
        .defaultTo('open')
      table.string('subject', 180).notNullable()
      table.text('initial_message').nullable()
      table.string('event_type', 80).nullable()
      table.integer('attendance').unsigned().nullable()
      table.timestamp('preferred_starts_at').notNullable()
      table.timestamp('preferred_ends_at').notNullable()
      table.string('original_start_local', 40).notNullable()
      table.string('original_end_local', 40).notNullable()
      table.string('original_timezone', 100).notNullable()
      table.string('space_name_snapshot_ar', 180).nullable()
      table.string('space_name_snapshot_en', 180).nullable()
      table.string('venue_name_snapshot_ar', 180).nullable()
      table.string('venue_name_snapshot_en', 180).nullable()
      table.string('customer_name_snapshot', 180).nullable()
      table.string('customer_email_snapshot', 254).nullable()
      table
        .enum('contact_preference', ['in_app', 'email', 'phone'])
        .notNullable()
        .defaultTo('in_app')
      table.integer('lock_version').unsigned().notNullable().defaultTo(1)
      table.timestamp('response_expires_at').notNullable()
      table.timestamp('answered_at').nullable()
      table.timestamp('closed_at').nullable()
      table.timestamp('cancelled_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check('preferred_starts_at < preferred_ends_at')
      table.check('attendance IS NULL OR attendance > 0')
      table.index(['company_id', 'status', 'created_at'])
      table.index(['user_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable('space_inquiries')
  }
}
