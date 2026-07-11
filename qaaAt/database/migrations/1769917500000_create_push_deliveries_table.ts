import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('push_deliveries', (table) => {
      table.bigIncrements('id').primary()
      table
        .bigInteger('notification_id')
        .notNullable()
        .references('id')
        .inTable('notifications')
        .onDelete('CASCADE')
      table
        .bigInteger('push_installation_id')
        .notNullable()
        .references('id')
        .inTable('push_installations')
        .onDelete('CASCADE')
      table.string('status', 32).notNullable().defaultTo('pending')
      table.string('expo_ticket_id', 255).nullable()
      table.integer('attempts').notNullable().defaultTo(0)
      table.timestamp('next_attempt_at').nullable()
      table.timestamp('processing_started_at').nullable()
      table.timestamp('sent_at').nullable()
      table.timestamp('receipt_checked_at').nullable()
      table.timestamp('provider_accepted_at').nullable()
      table.string('last_error_code', 100).nullable()
      table.string('last_error_message', 500).nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()

      table.unique(['notification_id', 'push_installation_id'], {
        indexName: 'push_deliveries_notification_installation_unique',
      })
      table.check(
        "status IN ('pending', 'sending', 'ticket_received', 'provider_accepted', 'retry_scheduled', 'permanently_failed')"
      )
      table.index(['status', 'next_attempt_at'], 'push_deliveries_sendable_index')
      table.index(['status', 'sent_at'], 'push_deliveries_receipt_index')
    })

    this.schema.alterTable('notification_outbox', (table) => {
      table.timestamp('processing_started_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable('notification_outbox', (table) => {
      table.dropColumn('processing_started_at')
    })
    this.schema.dropTable('push_deliveries')
  }
}
