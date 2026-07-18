import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('payments', (table) => {
      table.bigIncrements('id').primary()
      table.uuid('reference').notNullable().unique()
      table.integer('user_id').unsigned().notNullable().references('users.id')
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('booking_id').unsigned().notNullable().references('bookings.id')
      table.integer('quote_id').unsigned().nullable()
      table.integer('quote_revision_id').unsigned().nullable()
      table.enum('purpose', ['full_payment', 'deposit']).notNullable()
      table
        .enum('status', ['pending', 'paid', 'partially_refunded', 'refunded'])
        .notNullable()
        .defaultTo('pending')
      table.string('provider', 40).notNullable()
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table.bigInteger('expected_amount_minor').notNullable()
      table.bigInteger('booking_total_minor').notNullable()
      table.bigInteger('amount_paid_minor').notNullable().defaultTo(0)
      table.bigInteger('amount_refunded_minor').notNullable().defaultTo(0)
      table.bigInteger('remaining_balance_minor').notNullable()
      table.bigInteger('latest_successful_attempt_id').nullable()
      table.timestamp('paid_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.unique(['booking_id', 'purpose'])
      table.unique(['id', 'booking_id'])
      table.unique(['id', 'company_id'])
      table.unique(['id', 'user_id', 'company_id', 'booking_id'])
      table.unique(['id', 'user_id', 'provider'])
      table.check("currency = 'SAR'")
      table.check(
        'expected_amount_minor >= 0 AND booking_total_minor >= 0 AND amount_paid_minor >= 0 AND amount_refunded_minor >= 0 AND remaining_balance_minor >= 0'
      )
      table.check('amount_refunded_minor <= amount_paid_minor')
      table.foreign(['quote_id']).references(['id']).inTable('quotes')
      table
        .foreign(['quote_revision_id', 'quote_id'])
        .references(['id', 'quote_id'])
        .inTable('quote_revisions')
      table
        .foreign(['booking_id', 'user_id', 'company_id'])
        .references(['id', 'user_id', 'company_id'])
        .inTable('bookings')
      table
        .foreign(['booking_id', 'quote_id', 'quote_revision_id'])
        .references(['id', 'accepted_quote_id', 'accepted_quote_revision_id'])
        .inTable('bookings')
    })
  }

  async down() {
    this.schema.dropTable('payments')
  }
}
