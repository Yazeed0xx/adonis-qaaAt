import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('visit_requests', (table) => {
      table.increments('id').primary()
      table.string('reference', 40).notNullable().unique()
      table.integer('company_id').unsigned().notNullable()
      table.integer('venue_id').unsigned().notNullable().references('venues.id')
      table.integer('space_id').unsigned().nullable().references('spaces.id')
      table.integer('user_id').unsigned().notNullable().references('users.id')
      table.integer('inquiry_id').unsigned().nullable().references('space_inquiries.id')
      table.integer('booking_id').unsigned().nullable().references('bookings.id')
      table
        .enum('status', [
          'submitted',
          'alternative_proposed',
          'confirmed',
          'rejected',
          'cancelled',
          'completed',
          'no_show',
          'expired',
        ])
        .notNullable()
        .defaultTo('submitted')
      table.timestamp('starts_at').notNullable()
      table.timestamp('ends_at').notNullable()
      table.timestamp('proposed_starts_at').nullable()
      table.timestamp('proposed_ends_at').nullable()
      table.string('proposed_start_local', 40).nullable()
      table.string('proposed_end_local', 40).nullable()
      table.string('original_start_local', 40).notNullable()
      table.string('original_end_local', 40).notNullable()
      table.string('original_timezone', 100).notNullable()
      table.string('customer_name_snapshot', 180).nullable()
      table.string('customer_email_snapshot', 254).nullable()
      table.text('customer_notes').nullable()
      table.text('provider_notes').nullable()
      table.text('status_reason').nullable()
      table.integer('lock_version').unsigned().notNullable().defaultTo(1)
      table.timestamp('response_expires_at').notNullable()
      table.timestamp('confirmed_at').nullable()
      table.timestamp('completed_at').nullable()
      table.timestamp('cancelled_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check('starts_at < ends_at')
      table.check(
        '(proposed_starts_at IS NULL AND proposed_ends_at IS NULL) OR (proposed_starts_at < proposed_ends_at)'
      )
      table.index(['company_id', 'status', 'starts_at'])
      table.index(['user_id', 'created_at'])
      table.index(['venue_id', 'status', 'starts_at', 'ends_at'])
    })
  }

  async down() {
    this.schema.dropTable('visit_requests')
  }
}
