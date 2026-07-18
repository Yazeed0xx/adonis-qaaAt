import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('payment_webhook_events', (table) => {
      table.bigIncrements('id').primary()
      table.string('provider', 40).notNullable()
      table.string('provider_event_id', 180).notNullable()
      table.boolean('signature_verified').notNullable()
      table.string('event_type', 100).nullable()
      table.string('provider_object_reference', 180).nullable()
      table.string('internal_correlation_reference', 180).nullable()
      table.string('payload_hash', 64).notNullable()
      table.jsonb('safe_payload').nullable()
      table.timestamp('received_at').notNullable().defaultTo(this.now())
      table.timestamp('processed_at').nullable()
      table
        .enum('outcome', [
          'received',
          'processed',
          'duplicate',
          'rejected',
          'reconciliation_required',
          'ignored',
        ])
        .notNullable()
        .defaultTo('received')
      table.string('failure_reason', 240).nullable()
      table.integer('processing_attempts').unsigned().notNullable().defaultTo(0)
      table.timestamp('last_processing_attempt_at').nullable()
      table.unique(['provider', 'provider_event_id'])
      table.index(['outcome', 'received_at', 'id'])
    })
  }

  async down() {
    this.schema.dropTable('payment_webhook_events')
  }
}
