import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('payment_disputes', (table) => {
      table.bigIncrements('id').primary()
      table.uuid('reference').notNullable().unique()
      table.bigInteger('payment_id').notNullable().references('payments.id').onDelete('RESTRICT')
      table.bigInteger('refund_id').nullable().references('refunds.id').onDelete('RESTRICT')
      table
        .integer('booking_id')
        .unsigned()
        .notNullable()
        .references('bookings.id')
        .onDelete('RESTRICT')
      table
        .integer('company_id')
        .unsigned()
        .notNullable()
        .references('companies.id')
        .onDelete('RESTRICT')
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('RESTRICT')
      table
        .integer('opened_by_admin_user_id')
        .unsigned()
        .notNullable()
        .references('users.id')
        .onDelete('RESTRICT')
      table
        .integer('resolved_by_admin_user_id')
        .unsigned()
        .nullable()
        .references('users.id')
        .onDelete('RESTRICT')
      table
        .enum('status', ['open', 'under_review', 'resolved', 'rejected'])
        .notNullable()
        .defaultTo('open')
      table.text('reason').notNullable()
      table.text('resolution').nullable()
      table.timestamp('resolved_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()

      table
        .foreign(['payment_id', 'booking_id'])
        .references(['id', 'booking_id'])
        .inTable('payments')
      table
        .foreign(['payment_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('payments')
      table
        .foreign(['payment_id', 'user_id', 'company_id', 'booking_id'])
        .references(['id', 'user_id', 'company_id', 'booking_id'])
        .inTable('payments')
      table.check(
        "(status IN ('open', 'under_review') AND resolution IS NULL AND resolved_at IS NULL AND resolved_by_admin_user_id IS NULL) OR (status IN ('resolved', 'rejected') AND resolution IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by_admin_user_id IS NOT NULL)",
        [],
        'payment_disputes_resolution_state_check'
      )
      table.index(['status', 'created_at'])
      table.index(['company_id', 'created_at'])
      table.index(['booking_id', 'created_at'])
    })

    this.schema.raw(
      "CREATE UNIQUE INDEX payment_disputes_one_active_per_payment ON payment_disputes (payment_id) WHERE status IN ('open', 'under_review')"
    )
  }

  async down() {
    this.schema.dropTable('payment_disputes')
  }
}
