import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('external_reservations', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable()
      table.integer('space_id').unsigned().notNullable()
      table
        .enum('type', [
          'external_confirmed',
          'external_hold',
          'maintenance',
          'closure',
          'internal_event',
        ])
        .notNullable()
      table
        .enum('status', ['active', 'cancelled', 'expired', 'released'])
        .notNullable()
        .defaultTo('active')
      table.timestamp('starts_at').notNullable()
      table.timestamp('ends_at').notNullable()
      table.string('original_start_local', 40).notNullable()
      table.string('original_end_local', 40).notNullable()
      table.string('original_timezone', 100).notNullable()
      table.integer('preparation_buffer_minutes').unsigned().notNullable().defaultTo(0)
      table.integer('cleanup_buffer_minutes').unsigned().notNullable().defaultTo(0)
      table.timestamp('expires_at').nullable()
      table.text('internal_note').nullable()
      table.integer('created_by_user_id').unsigned().nullable().references('users.id')
      table.timestamp('cancelled_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check('starts_at < ends_at')
      table.check("(type <> 'external_hold' OR expires_at IS NOT NULL)")
      table.index(['company_id', 'starts_at'])
      table.index(['status', 'expires_at'])
    })
  }

  async down() {
    this.schema.dropTable('external_reservations')
  }
}
