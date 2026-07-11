import { BaseSchema } from '@adonisjs/lucid/schema'
import {
  assertBtreeGistAvailable,
  classifyAcceptedBooking,
} from '../../app/lib/sprint3_migration_preflight.js'

export default class extends BaseSchema {
  async up() {
    this.defer(async () => {
      const available = await this.db
        .from('pg_available_extensions')
        .where('name', 'btree_gist')
        .first()
      assertBtreeGistAvailable(Boolean(available))
      try {
        await this.db.rawQuery('CREATE EXTENSION IF NOT EXISTS btree_gist')
      } catch (error) {
        throw new Error(
          `SPRINT3_BTREE_GIST_PROVISIONING_REQUIRED: grant CREATE EXTENSION or pre-provision btree_gist before running migrations (${error instanceof Error ? error.message : 'unknown error'})`
        )
      }
    })

    this.schema.raw(
      "ALTER TABLE venues ADD COLUMN timezone varchar(100) NOT NULL DEFAULT 'Asia/Riyadh'"
    )
    this.schema.raw("UPDATE venues SET timezone = 'Asia/Riyadh' WHERE timezone IS NULL")

    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check')
    this.schema.raw(
      "ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending','accepted','rejected','expired','confirmed','cancelled','completed','payment_expired'))"
    )
    this.schema.raw('ALTER TABLE booking_audit_logs ALTER COLUMN actor_user_id DROP NOT NULL')
    this.schema.raw(
      'ALTER TABLE spaces ADD CONSTRAINT spaces_id_company_unique UNIQUE (id, company_id)'
    )

    this.schema.createTable('space_availability_policies', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable()
      table.integer('space_id').unsigned().notNullable().unique()
      table.enum('mode', ['hourly', 'session', 'full_day', 'multi_day']).notNullable()
      table.integer('slot_increment_minutes').unsigned().notNullable().defaultTo(60)
      table.integer('minimum_duration_minutes').unsigned().notNullable().defaultTo(60)
      table.integer('maximum_duration_minutes').unsigned().notNullable().defaultTo(720)
      table.integer('minimum_notice_minutes').unsigned().notNullable().defaultTo(0)
      table.integer('maximum_advance_days').unsigned().notNullable().defaultTo(365)
      table.integer('preparation_buffer_minutes').unsigned().notNullable().defaultTo(0)
      table.integer('cleanup_buffer_minutes').unsigned().notNullable().defaultTo(0)
      table.enum('source', ['provider', 'legacy_migrated']).notNullable().defaultTo('provider')
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check('minimum_duration_minutes <= maximum_duration_minutes')
      table.check('slot_increment_minutes > 0')
    })

    this.schema.createTable('space_operating_hours', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable()
      table.integer('space_id').unsigned().notNullable()
      table.integer('weekday').notNullable()
      table.time('opens_at_local').notNullable()
      table.time('closes_at_local').notNullable()
      table.boolean('ends_next_day').notNullable().defaultTo(false)
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.unique(['space_id', 'weekday', 'opens_at_local', 'closes_at_local'])
      table.check('weekday BETWEEN 0 AND 6')
    })

    this.schema.createTable('space_availability_sessions', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable()
      table.integer('space_id').unsigned().notNullable()
      table.string('code', 80).notNullable()
      table.string('name_ar', 120).nullable()
      table.string('name_en', 120).nullable()
      table.integer('weekday').notNullable()
      table.time('starts_at_local').notNullable()
      table.time('ends_at_local').notNullable()
      table.boolean('ends_next_day').notNullable().defaultTo(false)
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.unique(['space_id', 'code', 'weekday'])
      table.check('weekday BETWEEN 0 AND 6')
      table.check('(name_ar IS NOT NULL OR name_en IS NOT NULL)')
    })

    this.schema.createTable('availability_exceptions', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable()
      table.integer('space_id').unsigned().notNullable()
      table.date('local_date').notNullable()
      table.enum('kind', ['closed', 'modified_hours', 'open_override']).notNullable()
      table.time('starts_at_local').nullable()
      table.time('ends_at_local').nullable()
      table.boolean('ends_next_day').notNullable().defaultTo(false)
      table.text('reason').nullable()
      table.integer('created_by_user_id').unsigned().nullable().references('users.id')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.index(['space_id', 'local_date'])
    })

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

    this.schema.createTable('space_inventory_events', (table) => {
      table.bigIncrements('id').primary()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('space_id').unsigned().notNullable().references('spaces.id')
      table
        .bigInteger('inventory_block_id')
        .unsigned()
        .nullable()
        .references('space_inventory_blocks.id')
      table.integer('actor_user_id').unsigned().nullable().references('users.id')
      table.string('action', 100).notNullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['space_id', 'created_at'])
    })

    this.schema.createTable('booking_inventory_migration_reports', (table) => {
      table.increments('id').primary()
      table.jsonb('status_counts').notNullable()
      table.integer('accepted_future_deadline').notNullable()
      table.integer('accepted_elapsed_deadline').notNullable()
      table.integer('accepted_missing_deadline').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
    })

    this.defer(() => this.backfill())
  }

  private async backfill() {
    const counts = await this.db
      .from('bookings')
      .select('status')
      .count('* as count')
      .groupBy('status')
    const now = new Date()
    const accepted = await this.db
      .from('bookings')
      .where('status', 'accepted')
      .where('booking_date', '>=', now)
    const future = accepted.filter(
      (row) => classifyAcceptedBooking(row.payment_due_date, now) === 'active_hold'
    )
    const elapsed = accepted.filter(
      (row) =>
        classifyAcceptedBooking(row.payment_due_date, now) === 'payment_expired_elapsed_deadline'
    )
    const missing = accepted.filter(
      (row) =>
        classifyAcceptedBooking(row.payment_due_date, now) === 'payment_expired_missing_deadline'
    )
    await this.db.table('booking_inventory_migration_reports').insert({
      status_counts: Object.fromEntries(counts.map((row) => [row.status, Number(row.count)])),
      accepted_future_deadline: future.length,
      accepted_elapsed_deadline: elapsed.length,
      accepted_missing_deadline: missing.length,
      created_at: now,
    })
    if (elapsed.length || missing.length) {
      await this.db
        .from('bookings')
        .whereIn(
          'id',
          [...elapsed, ...missing].map((row) => row.id)
        )
        .update({ status: 'payment_expired', updated_at: now })
    }
    const spaces = await this.db.from('spaces').whereNotNull('legacy_hall_id')
    for (const space of spaces) {
      await this.db.table('space_availability_policies').insert({
        company_id: space.company_id,
        space_id: space.id,
        mode: 'hourly',
        slot_increment_minutes: 120,
        minimum_duration_minutes: 120,
        maximum_duration_minutes: 720,
        maximum_advance_days: 365,
        source: 'legacy_migrated',
        created_at: now,
      })
      for (let weekday = 0; weekday < 7; weekday++)
        await this.db.table('space_operating_hours').insert({
          company_id: space.company_id,
          space_id: space.id,
          weekday,
          opens_at_local: '08:00',
          closes_at_local: '22:00',
          created_at: now,
        })
    }
    const blocking = await this.db
      .from('bookings')
      .whereIn('status', ['confirmed', 'accepted'])
      .where('booking_date', '>=', now)
    for (const booking of blocking) {
      const space = spaces.find((item) => item.legacy_hall_id === booking.hall_id)
      if (!space) continue
      const venue = await this.db.from('venues').where('id', space.venue_id).firstOrFail()
      const start = new Date(
        `${booking.booking_date.toISOString?.().slice(0, 10) ?? booking.booking_date}T${booking.start_time}+03:00`
      )
      const end = new Date(
        `${booking.booking_date.toISOString?.().slice(0, 10) ?? booking.booking_date}T${booking.end_time}+03:00`
      )
      if (booking.status === 'confirmed')
        await this.db.table('space_inventory_blocks').insert({
          company_id: space.company_id,
          space_id: space.id,
          booking_id: booking.id,
          starts_at: start,
          ends_at: end,
          blocked_from_at: start,
          blocked_until_at: end,
          created_at: now,
        })
      else if (booking.payment_due_date && new Date(booking.payment_due_date) > now) {
        const [hold] = await this.db
          .table('booking_holds')
          .insert({
            company_id: space.company_id,
            space_id: space.id,
            booking_id: booking.id,
            starts_at: start,
            ends_at: end,
            expires_at: booking.payment_due_date,
            created_at: now,
          })
          .returning('id')
        await this.db.table('space_inventory_blocks').insert({
          company_id: space.company_id,
          space_id: space.id,
          booking_hold_id: hold.id,
          starts_at: start,
          ends_at: end,
          blocked_from_at: start,
          blocked_until_at: end,
          created_at: now,
        })
      }
      void venue
    }
  }

  async down() {
    this.schema.dropTable('booking_inventory_migration_reports')
    this.schema.dropTable('space_inventory_events')
    this.schema.dropTable('space_inventory_blocks')
    this.schema.dropTable('booking_holds')
    this.schema.dropTable('external_reservations')
    this.schema.dropTable('availability_exceptions')
    this.schema.dropTable('space_availability_sessions')
    this.schema.dropTable('space_operating_hours')
    this.schema.dropTable('space_availability_policies')
    this.schema.raw(
      'UPDATE booking_audit_logs bal SET actor_user_id = companies.user_id FROM companies WHERE bal.company_id = companies.id AND bal.actor_user_id IS NULL'
    )
    this.schema.raw('ALTER TABLE booking_audit_logs ALTER COLUMN actor_user_id SET NOT NULL')
    this.schema.raw('ALTER TABLE spaces DROP CONSTRAINT spaces_id_company_unique')
    this.schema.raw("UPDATE bookings SET status = 'expired' WHERE status = 'payment_expired'")
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT bookings_status_check')
    this.schema.raw(
      "ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending','accepted','rejected','expired','confirmed','cancelled','completed'))"
    )
    this.schema.raw('ALTER TABLE venues DROP COLUMN timezone')
  }
}
