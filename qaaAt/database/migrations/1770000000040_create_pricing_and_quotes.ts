import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw('ALTER TABLE bookings ALTER COLUMN total_price TYPE decimal(20, 2)')
    this.schema.alterTable('bookings', (table) => {
      table.integer('accepted_quote_id').unsigned().nullable()
      table.integer('accepted_quote_revision_id').unsigned().nullable()
      table.bigInteger('accepted_total_minor').nullable()
      table.unique(['accepted_quote_id'])
    })
    this.schema
      .raw(`ALTER TABLE bookings ADD CONSTRAINT bookings_accepted_quote_snapshot_check CHECK (
      (accepted_quote_id IS NULL AND accepted_quote_revision_id IS NULL AND accepted_total_minor IS NULL) OR
      (accepted_quote_id IS NOT NULL AND accepted_quote_revision_id IS NOT NULL AND accepted_total_minor IS NOT NULL AND accepted_total_minor >= 0)
    )`)
    this.schema.alterTable('category_request_response_policies', (table) => {
      table.integer('quote_hold_hours').unsigned().notNullable().defaultTo(48)
    })
    this.schema.alterTable('space_request_settings', (table) => {
      table.integer('quote_hold_hours').unsigned().nullable()
    })
    this.schema.raw(
      'ALTER TABLE category_request_response_policies ADD CONSTRAINT category_quote_hold_hours_check CHECK (quote_hold_hours BETWEEN 1 AND 72)'
    )
    this.schema.raw(
      'ALTER TABLE space_request_settings ADD CONSTRAINT space_quote_hold_hours_check CHECK (quote_hold_hours IS NULL OR quote_hold_hours BETWEEN 1 AND 72)'
    )
    this.schema.createTable('rate_plans', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('space_id').unsigned().notNullable()
      table.string('name_ar', 180).nullable()
      table.string('name_en', 180).nullable()
      table
        .enum('pricing_mode', [
          'hourly',
          'fixed_session',
          'half_day',
          'full_day',
          'package',
          'custom_quote',
        ])
        .notNullable()
      table.bigInteger('price_minor').nullable()
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table.boolean('prices_include_vat').notNullable().defaultTo(false)
      table.integer('vat_rate_bps').unsigned().notNullable().defaultTo(1500)
      table.integer('minimum_duration_minutes').unsigned().nullable()
      table.integer('maximum_duration_minutes').unsigned().nullable()
      table.integer('fixed_duration_minutes').unsigned().nullable()
      table.string('session_code', 80).nullable()
      table.boolean('is_active').notNullable().defaultTo(false)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('archived_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check("currency = 'SAR'")
      table.check('price_minor IS NULL OR price_minor >= 0')
      table.check('vat_rate_bps BETWEEN 0 AND 10000')
      table.check(
        "(pricing_mode = 'custom_quote' AND price_minor IS NULL) OR (pricing_mode <> 'custom_quote' AND price_minor IS NOT NULL)"
      )
      table.check(
        "pricing_mode = 'hourly' OR (minimum_duration_minutes IS NULL AND maximum_duration_minutes IS NULL)"
      )
      table.check(
        "pricing_mode = 'fixed_session' OR (fixed_duration_minutes IS NULL AND session_code IS NULL)"
      )
      table.index(['space_id', 'is_active'])
      table.unique(['id', 'company_id'])
    })

    this.schema.createTable('service_options', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.string('name_ar', 180).nullable()
      table.string('name_en', 180).nullable()
      table.text('description_ar').nullable()
      table.text('description_en').nullable()
      table.bigInteger('price_minor').notNullable()
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table.boolean('prices_include_vat').notNullable().defaultTo(false)
      table.integer('vat_rate_bps').unsigned().notNullable().defaultTo(1500)
      table.boolean('is_active').notNullable().defaultTo(false)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('archived_at').nullable()
      table.check("currency = 'SAR'")
      table.check('price_minor >= 0')
      table.check('vat_rate_bps BETWEEN 0 AND 10000')
      table.check('name_ar IS NOT NULL OR name_en IS NOT NULL')
      table.index(['company_id', 'is_active'])
      table.unique(['id', 'company_id'])
    })

    this.schema.createTable('space_service_options', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('space_id').unsigned().notNullable()
      table.integer('service_option_id').unsigned().notNullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table
        .foreign(['service_option_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('service_options')
      table.unique(['space_id', 'service_option_id'])
    })

    this.schema.createTable('packages', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('space_id').unsigned().notNullable()
      table.string('name_ar', 180).nullable()
      table.string('name_en', 180).nullable()
      table.text('description_ar').nullable()
      table.text('description_en').nullable()
      table.bigInteger('base_price_minor').notNullable()
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table.boolean('prices_include_vat').notNullable().defaultTo(false)
      table.integer('vat_rate_bps').unsigned().notNullable().defaultTo(1500)
      table.boolean('is_active').notNullable().defaultTo(false)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('archived_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check("currency = 'SAR'")
      table.check('base_price_minor >= 0')
      table.check('vat_rate_bps BETWEEN 0 AND 10000')
      table.check('name_ar IS NOT NULL OR name_en IS NOT NULL')
      table.index(['space_id', 'is_active'])
      table.unique(['id', 'company_id'])
    })

    this.schema.createTable('package_items', (table) => {
      table.increments('id').primary()
      table.integer('package_id').unsigned().notNullable()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('service_option_id').unsigned().nullable()
      table
        .enum('item_type', [
          'hall_rental',
          'hospitality',
          'seating',
          'bridal_room',
          'stage',
          'equipment',
          'staffing',
          'setup',
          'teardown',
          'service',
        ])
        .notNullable()
      table.string('description_ar', 240).nullable()
      table.string('description_en', 240).nullable()
      table.integer('quantity').unsigned().notNullable().defaultTo(1)
      table.boolean('is_included').notNullable().defaultTo(true)
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.check('quantity > 0')
      table.check(
        'description_ar IS NOT NULL OR description_en IS NOT NULL OR service_option_id IS NOT NULL'
      )
      table
        .foreign(['package_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('packages')
      table
        .foreign(['service_option_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('service_options')
      table.index(['package_id', 'sort_order'])
    })

    this.schema.createTable('quotes', (table) => {
      table.increments('id').primary()
      table.string('reference', 40).notNullable().unique()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('venue_id').unsigned().notNullable().references('venues.id')
      table.integer('space_id').unsigned().notNullable()
      table.integer('user_id').unsigned().notNullable().references('users.id')
      table.integer('inquiry_id').unsigned().nullable().references('space_inquiries.id')
      table.integer('visit_request_id').unsigned().nullable().references('visit_requests.id')
      table
        .integer('created_by_membership_id')
        .unsigned()
        .notNullable()
        .references('company_memberships.id')
      table.integer('booking_id').unsigned().nullable().references('bookings.id')
      table
        .enum('status', ['draft', 'sent', 'accepted', 'customer_declined', 'expired', 'withdrawn'])
        .notNullable()
        .defaultTo('draft')
      table.integer('current_revision_id').unsigned().nullable()
      table.integer('accepted_revision_id').unsigned().nullable()
      table.timestamp('starts_at').notNullable()
      table.timestamp('ends_at').notNullable()
      table.string('start_local', 40).notNullable()
      table.string('end_local', 40).notNullable()
      table.string('timezone', 100).notNullable()
      table.string('space_name_ar', 180).nullable()
      table.string('space_name_en', 180).nullable()
      table.string('venue_name_ar', 180).nullable()
      table.string('venue_name_en', 180).nullable()
      table.text('customer_request_snapshot').nullable()
      table.text('internal_notes').nullable()
      table.integer('lock_version').unsigned().notNullable().defaultTo(1)
      table.timestamp('sent_at').nullable()
      table.timestamp('accepted_at').nullable()
      table.timestamp('declined_at').nullable()
      table.timestamp('withdrawn_at').nullable()
      table.timestamp('expired_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.foreign(['space_id', 'company_id']).references(['id', 'company_id']).inTable('spaces')
      table.check('starts_at < ends_at')
      table.index(['company_id', 'status', 'created_at'])
      table.index(['user_id', 'status', 'created_at'])
      table.unique(['id', 'company_id'])
      table.unique(['booking_id'])
    })

    this.schema.createTable('quote_revisions', (table) => {
      table.increments('id').primary()
      table.integer('quote_id').unsigned().notNullable().references('quotes.id')
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('revision_number').unsigned().notNullable()
      table.enum('status', ['draft', 'sent', 'superseded']).notNullable().defaultTo('draft')
      table.bigInteger('subtotal_minor').notNullable().defaultTo(0)
      table.bigInteger('discount_minor').notNullable().defaultTo(0)
      table.bigInteger('vat_minor').notNullable().defaultTo(0)
      table.bigInteger('total_minor').notNullable().defaultTo(0)
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table.boolean('prices_include_vat').notNullable().defaultTo(false)
      table.integer('vat_rate_bps').unsigned().notNullable().defaultTo(1500)
      table.integer('deposit_percent').unsigned().nullable()
      table.bigInteger('deposit_minor').nullable()
      table.bigInteger('remaining_minor').nullable()
      table.timestamp('expires_at').nullable()
      table
        .integer('created_by_membership_id')
        .unsigned()
        .notNullable()
        .references('company_memberships.id')
      table
        .integer('sent_by_membership_id')
        .unsigned()
        .nullable()
        .references('company_memberships.id')
      table.timestamp('sent_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.unique(['quote_id', 'revision_number'])
      table.check("currency = 'SAR'")
      table.check(
        'subtotal_minor >= 0 AND discount_minor >= 0 AND vat_minor >= 0 AND total_minor >= 0'
      )
      table.check('discount_minor <= subtotal_minor')
      table.check('deposit_percent IS NULL OR deposit_percent BETWEEN 0 AND 100')
      table.index(['quote_id', 'status'])
      table.unique(['id', 'quote_id'])
      table.unique(['id', 'company_id'])
    })
    this.schema.raw(
      'ALTER TABLE quotes ADD CONSTRAINT quotes_current_revision_fk FOREIGN KEY (current_revision_id, id) REFERENCES quote_revisions(id, quote_id)'
    )
    this.schema.raw(
      'ALTER TABLE quotes ADD CONSTRAINT quotes_accepted_revision_fk FOREIGN KEY (accepted_revision_id, id) REFERENCES quote_revisions(id, quote_id)'
    )
    this.schema.raw(
      'ALTER TABLE bookings ADD CONSTRAINT bookings_accepted_quote_fk FOREIGN KEY (accepted_quote_id) REFERENCES quotes(id)'
    )
    this.schema.raw(
      'ALTER TABLE bookings ADD CONSTRAINT bookings_accepted_quote_revision_fk FOREIGN KEY (accepted_quote_revision_id, accepted_quote_id) REFERENCES quote_revisions(id, quote_id)'
    )

    this.schema.createTable('quote_line_items', (table) => {
      table.bigIncrements('id').primary()
      table.integer('quote_revision_id').unsigned().notNullable()
      table.integer('company_id').unsigned().notNullable()
      table.integer('rate_plan_id').unsigned().nullable()
      table.integer('package_id').unsigned().nullable()
      table.integer('service_option_id').unsigned().nullable()
      table.enum('item_type', ['rate_plan', 'package', 'service', 'adjustment']).notNullable()
      table.string('description_ar', 240).nullable()
      table.string('description_en', 240).nullable()
      table.integer('quantity').unsigned().notNullable()
      table.bigInteger('unit_price_minor').notNullable()
      table.bigInteger('subtotal_minor').notNullable()
      table.bigInteger('discount_minor').notNullable().defaultTo(0)
      table.integer('vat_rate_bps').unsigned().notNullable()
      table.bigInteger('vat_minor').notNullable()
      table.bigInteger('total_minor').notNullable()
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table.boolean('prices_include_vat').notNullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.check('quantity > 0')
      table.check(
        'unit_price_minor >= 0 AND subtotal_minor >= 0 AND discount_minor >= 0 AND vat_minor >= 0 AND total_minor >= 0'
      )
      table.check('discount_minor <= subtotal_minor')
      table.check("currency = 'SAR'")
      table.check(`
        (item_type = 'rate_plan' AND rate_plan_id IS NOT NULL AND package_id IS NULL AND service_option_id IS NULL) OR
        (item_type = 'package' AND package_id IS NOT NULL AND rate_plan_id IS NULL AND service_option_id IS NULL) OR
        (item_type = 'service' AND service_option_id IS NOT NULL AND rate_plan_id IS NULL AND package_id IS NULL) OR
        (item_type = 'adjustment' AND rate_plan_id IS NULL AND package_id IS NULL AND service_option_id IS NULL)
      `)
      table
        .foreign(['quote_revision_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('quote_revisions')
      table
        .foreign(['rate_plan_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('rate_plans')
      table
        .foreign(['package_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('packages')
      table
        .foreign(['service_option_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('service_options')
      table.index(['quote_revision_id', 'sort_order'])
    })

    this.schema.createTable('quote_events', (table) => {
      table.bigIncrements('id').primary()
      table.integer('quote_id').unsigned().notNullable().references('quotes.id')
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('actor_user_id').unsigned().nullable().references('users.id')
      table.string('action', 100).notNullable()
      table.string('previous_status', 40).nullable()
      table.string('next_status', 40).notNullable()
      table.integer('quote_revision_id').unsigned().nullable()
      table.text('reason').nullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['quote_id', 'created_at'])
      table.foreign(['quote_id', 'company_id']).references(['id', 'company_id']).inTable('quotes')
      table
        .foreign(['quote_revision_id', 'quote_id'])
        .references(['id', 'quote_id'])
        .inTable('quote_revisions')
    })
    this.schema.raw(`
      CREATE FUNCTION protect_sent_quote_line_items() RETURNS trigger AS $$
      DECLARE old_revision_status text; new_revision_status text;
      BEGIN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
          SELECT status INTO old_revision_status FROM quote_revisions WHERE id = OLD.quote_revision_id;
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
          SELECT status INTO new_revision_status FROM quote_revisions WHERE id = NEW.quote_revision_id;
        END IF;
        IF (old_revision_status IS NOT NULL AND old_revision_status <> 'draft') OR
           (new_revision_status IS NOT NULL AND new_revision_status <> 'draft') THEN
          RAISE EXCEPTION 'SENT_QUOTE_REVISION_IMMUTABLE' USING ERRCODE = 'check_violation';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER quote_line_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON quote_line_items
      FOR EACH ROW EXECUTE FUNCTION protect_sent_quote_line_items();

      CREATE FUNCTION protect_sent_quote_revision_values() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.status <> 'draft' THEN
            RAISE EXCEPTION 'QUOTE_REVISION_TRANSITION_INVALID' USING ERRCODE = 'check_violation';
          END IF;
          RETURN NEW;
        END IF;
        IF (OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'sent')) OR
           (OLD.status = 'sent' AND NEW.status NOT IN ('sent', 'superseded')) OR
           (OLD.status = 'superseded' AND NEW.status <> 'superseded') THEN
          RAISE EXCEPTION 'QUOTE_REVISION_TRANSITION_INVALID' USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.status <> 'draft' AND (
          NEW.quote_id <> OLD.quote_id OR NEW.company_id <> OLD.company_id OR
          NEW.revision_number <> OLD.revision_number OR NEW.subtotal_minor <> OLD.subtotal_minor OR NEW.discount_minor <> OLD.discount_minor OR
          NEW.vat_minor <> OLD.vat_minor OR NEW.total_minor <> OLD.total_minor OR
          NEW.currency <> OLD.currency OR
          NEW.prices_include_vat <> OLD.prices_include_vat OR NEW.vat_rate_bps <> OLD.vat_rate_bps OR
          NEW.deposit_percent IS DISTINCT FROM OLD.deposit_percent OR
          NEW.deposit_minor IS DISTINCT FROM OLD.deposit_minor OR NEW.remaining_minor IS DISTINCT FROM OLD.remaining_minor OR
          NEW.expires_at IS DISTINCT FROM OLD.expires_at OR
          NEW.created_by_membership_id <> OLD.created_by_membership_id OR
          NEW.sent_by_membership_id IS DISTINCT FROM OLD.sent_by_membership_id OR
          NEW.sent_at IS DISTINCT FROM OLD.sent_at OR NEW.created_at <> OLD.created_at
        ) THEN
          RAISE EXCEPTION 'SENT_QUOTE_REVISION_IMMUTABLE' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER quote_revisions_immutable BEFORE INSERT OR UPDATE ON quote_revisions
      FOR EACH ROW EXECUTE FUNCTION protect_sent_quote_revision_values();
    `)
  }

  async down() {
    const spaceOnly = await this.db
      .from('quotes')
      .whereNotNull('booking_id')
      .count('* as total')
      .first()
    if (Number(spaceOnly?.total))
      throw new Error(
        `SPRINT5_ROLLBACK_BLOCKED: ${spaceOnly?.total} accepted quote(s) reference Bookings`
      )
    this.schema.raw('ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_accepted_revision_fk')
    this.schema.raw('ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_current_revision_fk')
    this.schema.raw(
      'ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_accepted_quote_revision_fk'
    )
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_accepted_quote_fk')
    this.schema.dropTable('quote_events')
    this.schema.dropTable('quote_line_items')
    this.schema.dropTable('quote_revisions')
    this.schema.dropTable('quotes')
    this.schema.dropTable('package_items')
    this.schema.dropTable('packages')
    this.schema.dropTable('space_service_options')
    this.schema.dropTable('service_options')
    this.schema.dropTable('rate_plans')
    this.schema.raw('DROP FUNCTION IF EXISTS protect_sent_quote_line_items() CASCADE')
    this.schema.raw('DROP FUNCTION IF EXISTS protect_sent_quote_revision_values() CASCADE')
    this.schema.raw(
      'ALTER TABLE space_request_settings DROP CONSTRAINT IF EXISTS space_quote_hold_hours_check'
    )
    this.schema.raw(
      'ALTER TABLE category_request_response_policies DROP CONSTRAINT IF EXISTS category_quote_hold_hours_check'
    )
    this.schema.alterTable('space_request_settings', (table) =>
      table.dropColumn('quote_hold_hours')
    )
    this.schema.alterTable('category_request_response_policies', (table) =>
      table.dropColumn('quote_hold_hours')
    )
    this.schema.alterTable('bookings', (table) => {
      table.dropColumn('accepted_total_minor')
      table.dropColumn('accepted_quote_revision_id')
      table.dropColumn('accepted_quote_id')
    })
    this.schema.raw('ALTER TABLE bookings ALTER COLUMN total_price TYPE decimal(10, 2)')
  }
}
