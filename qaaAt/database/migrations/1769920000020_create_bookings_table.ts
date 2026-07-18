import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('bookings', (table) => {
      table.increments('id').primary()
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('RESTRICT')
      table
        .integer('company_id')
        .unsigned()
        .notNullable()
        .references('companies.id')
        .onDelete('RESTRICT')
      table
        .integer('venue_id')
        .unsigned()
        .notNullable()
        .references('venues.id')
        .onDelete('RESTRICT')
      table.integer('space_id').unsigned().notNullable()
      table.string('request_reference', 64).notNullable().unique()

      table.date('booking_date').notNullable()
      table.time('start_time').notNullable()
      table.time('end_time').notNullable()
      table.timestamp('starts_at').notNullable()
      table.timestamp('ends_at').notNullable()
      table.string('original_start_local', 40).notNullable()
      table.string('original_end_local', 40).notNullable()
      table.string('original_timezone', 100).notNullable()
      table.string('session_code', 80).nullable()

      table.string('space_name_snapshot_ar', 180).nullable()
      table.string('space_name_snapshot_en', 180).nullable()
      table.string('venue_name_snapshot_ar', 180).nullable()
      table.string('venue_name_snapshot_en', 180).nullable()
      table.string('category_slug_snapshot', 80).notNullable()
      table.string('customer_name_snapshot', 180).notNullable()
      table.string('customer_email_snapshot', 254).notNullable()
      table.string('customer_phone_snapshot', 40).nullable()
      table
        .enum('contact_preference', ['in_app', 'email', 'phone'])
        .notNullable()
        .defaultTo('in_app')
      table.string('event_type', 80).nullable()
      table.integer('attendance').unsigned().nullable()
      table.text('special_requests').nullable()
      table.jsonb('category_requirements').nullable()
      table.integer('requirements_schema_version').unsigned().notNullable().defaultTo(1)

      table
        .enum('status', [
          'pending',
          'accepted',
          'rejected',
          'expired',
          'confirmed',
          'cancelled',
          'completed',
          'payment_expired',
          'partially_refunded',
          'refunded',
        ])
        .notNullable()
        .defaultTo('pending')
      table
        .enum('payment_status', [
          'unpaid',
          'deposit_paid',
          'paid',
          'partially_refunded',
          'refunded',
        ])
        .notNullable()
        .defaultTo('unpaid')
      table.decimal('total_price', 20, 2).nullable()
      table.bigInteger('paid_total_minor').notNullable().defaultTo(0)
      table.bigInteger('remaining_total_minor').nullable()

      table.text('rejection_reason').nullable()
      table.timestamp('company_responded_at').nullable()
      table.timestamp('expires_at').nullable()
      table.timestamp('payment_due_date').nullable()
      table.timestamp('submitted_at').nullable()
      table.timestamp('response_expires_at').nullable()
      table.timestamp('confirmed_at').nullable()
      table.timestamp('cancelled_at').nullable()
      table.integer('lock_version').unsigned().notNullable().defaultTo(1)

      table.integer('accepted_quote_id').unsigned().nullable().unique()
      table.integer('accepted_quote_revision_id').unsigned().nullable()
      table.bigInteger('accepted_total_minor').nullable()
      table.integer('cancellation_policy_version_id').unsigned().nullable()
      table.jsonb('cancellation_policy_snapshot').nullable()

      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()

      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.unique(['id', 'user_id', 'company_id'], { indexName: 'bookings_owner_unique' })
      table.unique(['id', 'accepted_quote_id', 'accepted_quote_revision_id'], {
        indexName: 'bookings_quote_snapshot_unique',
      })
      table.index(['user_id', 'deleted_at', 'created_at'], 'bookings_user_listing_index')
      table.index(['company_id', 'status', 'submitted_at'], 'bookings_company_status_index')
      table.index(['space_id', 'starts_at', 'ends_at'], 'bookings_space_interval_index')
      table.index(['status', 'expires_at'], 'bookings_status_expires_index')
      table.index(['payment_status'], 'bookings_payment_status_index')

      table.check('starts_at < ends_at', [], 'bookings_interval_check')
      table.check('attendance IS NULL OR attendance > 0', [], 'bookings_attendance_check')
      table.check(
        'paid_total_minor >= 0 AND (remaining_total_minor IS NULL OR remaining_total_minor >= 0)',
        [],
        'bookings_money_check'
      )
      table.check(
        `(
          accepted_quote_id IS NULL
          AND accepted_quote_revision_id IS NULL
          AND accepted_total_minor IS NULL
        ) OR (
          accepted_quote_id IS NOT NULL
          AND accepted_quote_revision_id IS NOT NULL
          AND accepted_total_minor IS NOT NULL
          AND accepted_total_minor >= 0
        )`,
        [],
        'bookings_accepted_quote_snapshot_check'
      )
    })
  }

  async down() {
    this.schema.dropTable('bookings')
  }
}
