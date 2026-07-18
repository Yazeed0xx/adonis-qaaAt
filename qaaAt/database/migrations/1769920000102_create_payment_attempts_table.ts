import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('payment_attempts', (table) => {
      table.bigIncrements('id').primary()
      table.uuid('reference').notNullable().unique()
      table.bigInteger('payment_id').notNullable().references('payments.id')
      table.integer('user_id').unsigned().notNullable().references('users.id')
      table.string('provider', 40).notNullable()
      table.string('provider_payment_reference', 180).nullable()
      table.string('provider_attempt_reference', 180).nullable()
      table.string('idempotency_key', 180).notNullable()
      table.string('request_fingerprint', 64).notNullable()
      table.bigInteger('requested_amount_minor').notNullable()
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table
        .enum('status', [
          'created',
          'provider_pending',
          'succeeded',
          'failed',
          'cancelled',
          'unknown',
          'expired',
        ])
        .notNullable()
        .defaultTo('created')
      table.text('checkout_url').nullable()
      table.string('failure_code', 100).nullable()
      table.string('failure_message', 240).nullable()
      table.timestamp('initiated_at').notNullable().defaultTo(this.now())
      table.timestamp('succeeded_at').nullable()
      table.timestamp('failed_at').nullable()
      table.timestamp('cancelled_at').nullable()
      table.timestamp('updated_at').nullable()
      table.unique(['user_id', 'provider', 'idempotency_key'])
      table.unique(['provider', 'provider_attempt_reference'])
      table.unique(['provider', 'provider_payment_reference'])
      table.unique(['id', 'payment_id'])
      table.check("currency = 'SAR'")
      table.check('requested_amount_minor >= 0')
      table.check(
        '(provider_payment_reference IS NULL AND provider_attempt_reference IS NULL) OR (provider_payment_reference IS NOT NULL AND provider_attempt_reference IS NOT NULL)'
      )
      table
        .foreign(['payment_id', 'user_id', 'provider'])
        .references(['id', 'user_id', 'provider'])
        .inTable('payments')
    })

    this.schema.raw(
      "CREATE UNIQUE INDEX payment_attempts_one_success_per_payment ON payment_attempts (payment_id) WHERE status = 'succeeded'"
    )
  }

  async down() {
    this.schema.dropTable('payment_attempts')
  }
}
