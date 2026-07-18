import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('booking_holds', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable()
      table.integer('space_id').unsigned().notNullable()
      table.integer('booking_id').unsigned().notNullable().unique().references('bookings.id')
      table.enum('purpose', ['payment']).notNullable().defaultTo('payment')
      table
        .enum('status', ['active', 'converted', 'released', 'expired', 'cancelled'])
        .notNullable()
        .defaultTo('active')
      table.timestamp('starts_at').notNullable()
      table.timestamp('ends_at').notNullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('released_at').nullable()
      table.string('release_reason', 120).nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check('starts_at < ends_at')
      table.index(['status', 'expires_at'])
    })
  }

  async down() {
    this.schema.dropTable('booking_holds')
  }
}
