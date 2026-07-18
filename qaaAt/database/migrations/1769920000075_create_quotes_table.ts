import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('quotes', (table) => {
      table.increments('id').primary()
      table.string('reference', 40).notNullable().unique()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('venue_id').unsigned().notNullable().references('venues.id')
      table.integer('space_id').unsigned().notNullable()
      table.integer('user_id').unsigned().notNullable().references('users.id')
      table.integer('inquiry_id').unsigned().nullable().references('space_inquiries.id')
      table.integer('visit_request_id').unsigned().nullable().references('visit_requests.id')
      table
        .integer('created_by_membership_id')
        .unsigned()
        .notNullable()
        .references('company_memberships.id')
      table.integer('booking_id').unsigned().nullable().references('bookings.id')
      table
        .enum('status', ['draft', 'sent', 'accepted', 'customer_declined', 'expired', 'withdrawn'])
        .notNullable()
        .defaultTo('draft')
      table.integer('current_revision_id').unsigned().nullable()
      table.integer('accepted_revision_id').unsigned().nullable()
      table.timestamp('starts_at').notNullable()
      table.timestamp('ends_at').notNullable()
      table.string('start_local', 40).notNullable()
      table.string('end_local', 40).notNullable()
      table.string('timezone', 100).notNullable()
      table.string('space_name_ar', 180).nullable()
      table.string('space_name_en', 180).nullable()
      table.string('venue_name_ar', 180).nullable()
      table.string('venue_name_en', 180).nullable()
      table.text('customer_request_snapshot').nullable()
      table.text('internal_notes').nullable()
      table.integer('lock_version').unsigned().notNullable().defaultTo(1)
      table.timestamp('sent_at').nullable()
      table.timestamp('accepted_at').nullable()
      table.timestamp('declined_at').nullable()
      table.timestamp('withdrawn_at').nullable()
      table.timestamp('expired_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check('starts_at < ends_at')
      table.index(['company_id', 'status', 'created_at'])
      table.index(['user_id', 'status', 'created_at'])
      table.unique(['id', 'company_id'])
      table.unique(['booking_id'])
    })
  }

  async down() {
    this.schema.dropTable('quotes')
  }
}
