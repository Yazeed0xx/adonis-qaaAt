import { BaseSchema } from '@adonisjs/lucid/schema'
import { assertSprint4RollbackSafe } from '#lib/sprint4_migration_preflight'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('bookings', (table) => {
      table.integer('company_id').unsigned().nullable()
      table.integer('venue_id').unsigned().nullable()
      table.integer('space_id').unsigned().nullable()
      table.string('request_reference', 40).nullable().unique()
      table
        .enum('request_source', ['legacy_hall_api', 'space_api'])
        .notNullable()
        .defaultTo('legacy_hall_api')
      table.string('space_name_snapshot_ar', 180).nullable()
      table.string('space_name_snapshot_en', 180).nullable()
      table.string('venue_name_snapshot_ar', 180).nullable()
      table.string('venue_name_snapshot_en', 180).nullable()
      table.string('category_slug_snapshot', 80).nullable()
      table.string('customer_name_snapshot', 180).nullable()
      table.string('customer_email_snapshot', 254).nullable()
      table.string('customer_phone_snapshot', 40).nullable()
      table
        .enum('contact_preference', ['in_app', 'email', 'phone'])
        .notNullable()
        .defaultTo('in_app')
      table.string('event_type', 80).nullable()
      table.integer('attendance').unsigned().nullable()
      table.string('session_code', 80).nullable()
      table.timestamp('starts_at').nullable()
      table.timestamp('ends_at').nullable()
      table.string('original_start_local', 40).nullable()
      table.string('original_end_local', 40).nullable()
      table.string('original_timezone', 100).nullable()
      table.jsonb('category_requirements').nullable()
      table.integer('requirements_schema_version').unsigned().notNullable().defaultTo(1)
      table.integer('lock_version').unsigned().notNullable().defaultTo(1)
      table.timestamp('submitted_at').nullable()
      table.timestamp('response_expires_at').nullable()
      table.index(['company_id', 'status', 'submitted_at'])
      table.index(['space_id', 'starts_at', 'ends_at'])
    })
    this.schema.raw('ALTER TABLE bookings ALTER COLUMN hall_id DROP NOT NULL')
    this.schema.raw('ALTER TABLE bookings ALTER COLUMN total_price DROP NOT NULL')
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE bookings b SET
          company_id = h.company_id,
          space_id = s.id,
          venue_id = s.venue_id,
          request_reference = 'LEG-' || b.id,
          space_name_snapshot_ar = s.name_ar,
          space_name_snapshot_en = COALESCE(s.name_en, s.legacy_name, h.name),
          venue_name_snapshot_ar = v.name_ar,
          venue_name_snapshot_en = v.name_en,
          category_slug_snapshot = c.slug,
          customer_email_snapshot = u.email,
          starts_at = (b.booking_date::text || ' ' || b.start_time::text)::timestamp AT TIME ZONE v.timezone,
          ends_at = (b.booking_date::text || ' ' || b.end_time::text)::timestamp AT TIME ZONE v.timezone,
          original_start_local = b.booking_date::text || 'T' || b.start_time::text,
          original_end_local = b.booking_date::text || 'T' || b.end_time::text,
          original_timezone = v.timezone,
          submitted_at = b.created_at,
          response_expires_at = COALESCE(b.expires_at, b.created_at + interval '7 days')
        FROM halls h, spaces s, venues v, space_categories c, users u
        WHERE b.hall_id = h.id
          AND s.legacy_hall_id = h.id
          AND v.id = s.venue_id
          AND c.id = s.category_id
          AND u.id = b.user_id
      `)
      const unmapped = await db.from('bookings').whereNull('space_id').count('* as total').first()
      if (Number(unmapped?.total))
        throw new Error(
          `Sprint 4 migration blocked: ${unmapped?.total} Booking rows have no Hall-to-Space mapping`
        )
    })
    this.schema.raw(`
      CREATE FUNCTION populate_legacy_booking_request_fields() RETURNS trigger AS $$
      DECLARE mapped RECORD;
      BEGIN
        IF NEW.hall_id IS NOT NULL AND NEW.space_id IS NULL THEN
          SELECT h.company_id, s.id AS space_id, s.venue_id, s.name_ar, COALESCE(s.name_en, s.legacy_name, h.name) AS name_en,
                 v.name_ar AS venue_name_ar, v.name_en AS venue_name_en, v.timezone, c.slug, u.email
          INTO mapped FROM halls h JOIN spaces s ON s.legacy_hall_id = h.id JOIN venues v ON v.id = s.venue_id
          JOIN space_categories c ON c.id = s.category_id JOIN users u ON u.id = NEW.user_id WHERE h.id = NEW.hall_id;
          IF mapped.space_id IS NULL THEN RETURN NEW; END IF;
          NEW.company_id := mapped.company_id; NEW.space_id := mapped.space_id; NEW.venue_id := mapped.venue_id;
          NEW.request_reference := COALESCE(NEW.request_reference, 'LEG-' || md5(random()::text || clock_timestamp()::text));
          NEW.space_name_snapshot_ar := COALESCE(NEW.space_name_snapshot_ar, mapped.name_ar);
          NEW.space_name_snapshot_en := COALESCE(NEW.space_name_snapshot_en, mapped.name_en);
          NEW.venue_name_snapshot_ar := COALESCE(NEW.venue_name_snapshot_ar, mapped.venue_name_ar);
          NEW.venue_name_snapshot_en := COALESCE(NEW.venue_name_snapshot_en, mapped.venue_name_en);
          NEW.category_slug_snapshot := COALESCE(NEW.category_slug_snapshot, mapped.slug);
          NEW.customer_email_snapshot := COALESCE(NEW.customer_email_snapshot, mapped.email);
          NEW.starts_at := COALESCE(NEW.starts_at, (NEW.booking_date::text || ' ' || NEW.start_time::text)::timestamp AT TIME ZONE mapped.timezone);
          NEW.ends_at := COALESCE(NEW.ends_at, (NEW.booking_date::text || ' ' || NEW.end_time::text)::timestamp AT TIME ZONE mapped.timezone);
          NEW.original_start_local := COALESCE(NEW.original_start_local, NEW.booking_date::text || 'T' || NEW.start_time::text);
          NEW.original_end_local := COALESCE(NEW.original_end_local, NEW.booking_date::text || 'T' || NEW.end_time::text);
          NEW.original_timezone := COALESCE(NEW.original_timezone, mapped.timezone);
          NEW.submitted_at := COALESCE(NEW.submitted_at, NEW.created_at, CURRENT_TIMESTAMP);
          NEW.response_expires_at := COALESCE(NEW.response_expires_at, NEW.expires_at, CURRENT_TIMESTAMP + interval '7 days');
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER bookings_legacy_request_fields BEFORE INSERT ON bookings
      FOR EACH ROW EXECUTE FUNCTION populate_legacy_booking_request_fields();
    `)
    this.schema.raw(
      'ALTER TABLE bookings ADD CONSTRAINT bookings_space_company_fk FOREIGN KEY (space_id, company_id) REFERENCES spaces(id, company_id)'
    )
    this.schema.raw(
      'ALTER TABLE bookings ADD CONSTRAINT bookings_interval_check CHECK (starts_at IS NULL OR (ends_at IS NOT NULL AND starts_at < ends_at))'
    )
    this.schema.raw(
      'ALTER TABLE bookings ADD CONSTRAINT bookings_attendance_check CHECK (attendance IS NULL OR attendance > 0)'
    )
    this.schema.raw(
      "ALTER TABLE bookings ADD CONSTRAINT bookings_source_hall_check CHECK (request_source <> 'legacy_hall_api' OR hall_id IS NOT NULL)"
    )
    this.schema.raw(
      "ALTER TABLE bookings ADD CONSTRAINT bookings_space_source_check CHECK (request_source <> 'space_api' OR (company_id IS NOT NULL AND venue_id IS NOT NULL AND space_id IS NOT NULL AND request_reference IS NOT NULL))"
    )

    this.schema.createTable('category_request_response_policies', (table) => {
      table.increments('id').primary()
      table
        .integer('category_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('space_categories.id')
      table.integer('request_to_book_hours').unsigned().notNullable().defaultTo(168)
      table.integer('date_inquiry_hours').unsigned().notNullable().defaultTo(168)
      table.integer('visit_hours').unsigned().notNullable().defaultTo(72)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
    })
    this.defer(async (db) => {
      await db.rawQuery(`INSERT INTO category_request_response_policies (category_id)
        SELECT id FROM space_categories ON CONFLICT (category_id) DO NOTHING`)
    })
    this.schema.createTable('space_request_settings', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable()
      table.integer('space_id').unsigned().notNullable().unique()
      table.integer('booking_response_hours').unsigned().nullable()
      table.integer('inquiry_response_hours').unsigned().nullable()
      table.integer('visit_response_hours').unsigned().nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check('booking_response_hours IS NULL OR booking_response_hours BETWEEN 1 AND 720')
      table.check('inquiry_response_hours IS NULL OR inquiry_response_hours BETWEEN 1 AND 720')
      table.check('visit_response_hours IS NULL OR visit_response_hours BETWEEN 1 AND 720')
    })

    this.schema.createTable('space_inquiries', (table) => {
      table.increments('id').primary()
      table.string('reference', 40).notNullable().unique()
      table.integer('company_id').unsigned().notNullable()
      table.integer('venue_id').unsigned().notNullable().references('venues.id')
      table.integer('space_id').unsigned().notNullable()
      table.integer('user_id').unsigned().notNullable().references('users.id')
      table.enum('kind', ['date_inquiry']).notNullable().defaultTo('date_inquiry')
      table
        .enum('status', [
          'open',
          'under_review',
          'answered',
          'closed',
          'cancelled',
          'rejected',
          'expired',
        ])
        .notNullable()
        .defaultTo('open')
      table.string('subject', 180).notNullable()
      table.text('initial_message').nullable()
      table.string('event_type', 80).nullable()
      table.integer('attendance').unsigned().nullable()
      table.timestamp('preferred_starts_at').notNullable()
      table.timestamp('preferred_ends_at').notNullable()
      table.string('original_start_local', 40).notNullable()
      table.string('original_end_local', 40).notNullable()
      table.string('original_timezone', 100).notNullable()
      table.string('space_name_snapshot_ar', 180).nullable()
      table.string('space_name_snapshot_en', 180).nullable()
      table.string('venue_name_snapshot_ar', 180).nullable()
      table.string('venue_name_snapshot_en', 180).nullable()
      table.string('customer_name_snapshot', 180).nullable()
      table.string('customer_email_snapshot', 254).nullable()
      table
        .enum('contact_preference', ['in_app', 'email', 'phone'])
        .notNullable()
        .defaultTo('in_app')
      table.integer('lock_version').unsigned().notNullable().defaultTo(1)
      table.timestamp('response_expires_at').notNullable()
      table.timestamp('answered_at').nullable()
      table.timestamp('closed_at').nullable()
      table.timestamp('cancelled_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check('preferred_starts_at < preferred_ends_at')
      table.check('attendance IS NULL OR attendance > 0')
      table.index(['company_id', 'status', 'created_at'])
      table.index(['user_id', 'created_at'])
    })
    this.schema.createTable('inquiry_messages', (table) => {
      table.bigIncrements('id').primary()
      table.integer('inquiry_id').unsigned().notNullable().references('space_inquiries.id')
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('sender_user_id').unsigned().notNullable().references('users.id')
      table.enum('sender_type', ['customer', 'company_member']).notNullable()
      table.text('body').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['inquiry_id', 'created_at'])
    })
    this.schema.createTable('inquiry_events', (table) => {
      table.bigIncrements('id').primary()
      table.integer('inquiry_id').unsigned().notNullable().references('space_inquiries.id')
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('actor_user_id').unsigned().nullable().references('users.id')
      table.string('action', 100).notNullable()
      table.string('previous_status', 40).nullable()
      table.string('next_status', 40).notNullable()
      table.text('reason').nullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['inquiry_id', 'created_at'])
    })

    this.schema.createTable('visit_requests', (table) => {
      table.increments('id').primary()
      table.string('reference', 40).notNullable().unique()
      table.integer('company_id').unsigned().notNullable()
      table.integer('venue_id').unsigned().notNullable().references('venues.id')
      table.integer('space_id').unsigned().nullable().references('spaces.id')
      table.integer('user_id').unsigned().notNullable().references('users.id')
      table.integer('inquiry_id').unsigned().nullable().references('space_inquiries.id')
      table.integer('booking_id').unsigned().nullable().references('bookings.id')
      table
        .enum('status', [
          'submitted',
          'alternative_proposed',
          'confirmed',
          'rejected',
          'cancelled',
          'completed',
          'no_show',
          'expired',
        ])
        .notNullable()
        .defaultTo('submitted')
      table.timestamp('starts_at').notNullable()
      table.timestamp('ends_at').notNullable()
      table.timestamp('proposed_starts_at').nullable()
      table.timestamp('proposed_ends_at').nullable()
      table.string('proposed_start_local', 40).nullable()
      table.string('proposed_end_local', 40).nullable()
      table.string('original_start_local', 40).notNullable()
      table.string('original_end_local', 40).notNullable()
      table.string('original_timezone', 100).notNullable()
      table.string('customer_name_snapshot', 180).nullable()
      table.string('customer_email_snapshot', 254).nullable()
      table.text('customer_notes').nullable()
      table.text('provider_notes').nullable()
      table.text('status_reason').nullable()
      table.integer('lock_version').unsigned().notNullable().defaultTo(1)
      table.timestamp('response_expires_at').notNullable()
      table.timestamp('confirmed_at').nullable()
      table.timestamp('completed_at').nullable()
      table.timestamp('cancelled_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('deleted_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check('starts_at < ends_at')
      table.check(
        '(proposed_starts_at IS NULL AND proposed_ends_at IS NULL) OR (proposed_starts_at < proposed_ends_at)'
      )
      table.index(['company_id', 'status', 'starts_at'])
      table.index(['user_id', 'created_at'])
      table.index(['venue_id', 'status', 'starts_at', 'ends_at'])
    })
    this.schema.createTable('visit_events', (table) => {
      table.bigIncrements('id').primary()
      table.integer('visit_id').unsigned().notNullable().references('visit_requests.id')
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('actor_user_id').unsigned().nullable().references('users.id')
      table.string('action', 100).notNullable()
      table.string('previous_status', 40).nullable()
      table.string('next_status', 40).notNullable()
      table.text('reason').nullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['visit_id', 'created_at'])
    })
    this.schema.createTable('request_idempotency_keys', (table) => {
      table.bigIncrements('id').primary()
      table.integer('user_id').unsigned().notNullable().references('users.id')
      table.enum('scope', ['booking_create', 'inquiry_create', 'visit_create']).notNullable()
      table.string('idempotency_key', 120).notNullable()
      table.string('request_hash', 64).notNullable()
      table.string('resource_type', 40).notNullable()
      table.integer('resource_id').unsigned().notNullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.unique(['user_id', 'scope', 'idempotency_key'])
      table.index(['expires_at'])
    })
  }

  async down() {
    this.defer(async (db) => {
      const rows = await db.from('bookings').whereNull('hall_id').count('* as total').first()
      assertSprint4RollbackSafe(Number(rows?.total))
    })
    this.schema.dropTable('request_idempotency_keys')
    this.schema.dropTable('visit_events')
    this.schema.dropTable('visit_requests')
    this.schema.dropTable('inquiry_events')
    this.schema.dropTable('inquiry_messages')
    this.schema.dropTable('space_inquiries')
    this.schema.dropTable('space_request_settings')
    this.schema.dropTable('category_request_response_policies')
    this.schema.raw('DROP TRIGGER bookings_legacy_request_fields ON bookings')
    this.schema.raw('DROP FUNCTION populate_legacy_booking_request_fields()')
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT bookings_source_hall_check')
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT bookings_space_source_check')
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT bookings_attendance_check')
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT bookings_interval_check')
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT bookings_space_company_fk')
    this.schema.alterTable('bookings', (table) => {
      table.dropColumns(
        'company_id',
        'venue_id',
        'space_id',
        'request_reference',
        'request_source',
        'space_name_snapshot_ar',
        'space_name_snapshot_en',
        'venue_name_snapshot_ar',
        'venue_name_snapshot_en',
        'category_slug_snapshot',
        'customer_name_snapshot',
        'customer_email_snapshot',
        'customer_phone_snapshot',
        'contact_preference',
        'event_type',
        'attendance',
        'session_code',
        'starts_at',
        'ends_at',
        'original_start_local',
        'original_end_local',
        'original_timezone',
        'category_requirements',
        'requirements_schema_version',
        'lock_version',
        'submitted_at',
        'response_expires_at'
      )
    })
    this.schema.raw('ALTER TABLE bookings ALTER COLUMN hall_id SET NOT NULL')
    this.schema.raw('UPDATE bookings SET total_price = 0 WHERE total_price IS NULL')
    this.schema.raw('ALTER TABLE bookings ALTER COLUMN total_price SET NOT NULL')
  }
}
