import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('space_inventory_blocks', (table) => {
      table.bigIncrements('id').primary()
      table.integer('company_id').unsigned().notNullable()
      table.integer('space_id').unsigned().notNullable()
      table.integer('booking_id').unsigned().nullable().references('bookings.id')
      table.integer('booking_hold_id').unsigned().nullable().references('booking_holds.id')
      table
        .integer('external_reservation_id')
        .unsigned()
        .nullable()
        .references('external_reservations.id')
      table.timestamp('starts_at').notNullable()
      table.timestamp('ends_at').notNullable()
      table.timestamp('blocked_from_at').notNullable()
      table.timestamp('blocked_until_at').notNullable()
      table.enum('status', ['active', 'released']).notNullable().defaultTo('active')
      table.timestamp('released_at').nullable()
      table.string('release_reason', 120).nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check('starts_at < ends_at')
      table.check('blocked_from_at < blocked_until_at')
      table.check(
        'num_nonnulls(booking_id, booking_hold_id, external_reservation_id) = 1',
        [],
        'space_inventory_blocks_one_source_check'
      )
      table.index(['space_id', 'blocked_from_at', 'blocked_until_at'])
    })

    this.schema.raw(
      'CREATE UNIQUE INDEX space_inventory_blocks_booking_unique ON space_inventory_blocks (booking_id) WHERE booking_id IS NOT NULL'
    )

    this.schema.raw(
      'CREATE UNIQUE INDEX space_inventory_blocks_hold_unique ON space_inventory_blocks (booking_hold_id) WHERE booking_hold_id IS NOT NULL'
    )

    this.schema.raw(
      'CREATE UNIQUE INDEX space_inventory_blocks_external_unique ON space_inventory_blocks (external_reservation_id) WHERE external_reservation_id IS NOT NULL'
    )

    this.schema.raw(
      "ALTER TABLE space_inventory_blocks ADD CONSTRAINT space_inventory_blocks_no_overlap EXCLUDE USING gist (space_id WITH =, tstzrange(blocked_from_at, blocked_until_at, '[)') WITH &&) WHERE (status = 'active')"
    )
  }

  async down() {
    this.schema.dropTable('space_inventory_blocks')
  }
}
