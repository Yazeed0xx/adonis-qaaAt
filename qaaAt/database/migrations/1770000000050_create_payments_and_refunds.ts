import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT bookings_status_check')
    this.schema.raw(
      "ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending','accepted','rejected','expired','confirmed','cancelled','completed','payment_expired','partially_refunded','refunded'))"
    )
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT bookings_payment_status_check')
    this.schema.raw(
      "ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check CHECK (payment_status IN ('unpaid','deposit_paid','paid','partially_refunded','refunded'))"
    )
    this.schema.alterTable('bookings', (table) => {
      table.bigInteger('paid_total_minor').notNullable().defaultTo(0)
      table.bigInteger('remaining_total_minor').nullable()
      table.integer('cancellation_policy_version_id').unsigned().nullable()
      table.jsonb('cancellation_policy_snapshot').nullable()
      table.timestamp('confirmed_at').nullable()
      table.timestamp('cancelled_at').nullable()
    })
    this.schema.raw(
      'ALTER TABLE bookings ADD CONSTRAINT bookings_sprint6_money_check CHECK (paid_total_minor >= 0 AND (remaining_total_minor IS NULL OR remaining_total_minor >= 0))'
    )
    this.schema.raw(
      'ALTER TABLE bookings ADD CONSTRAINT bookings_sprint6_owner_unique UNIQUE (id, user_id, company_id)'
    )

    this.schema.createTable('cancellation_policies', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.string('name', 160).notNullable()
      table.integer('version').unsigned().notNullable()
      table.boolean('is_active').notNullable().defaultTo(false)
      table.boolean('deposit_non_refundable').notNullable().defaultTo(false)
      table.jsonb('tiers').notNullable()
      table
        .integer('created_by_membership_id')
        .unsigned()
        .notNullable()
        .references('company_memberships.id')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('archived_at').nullable()
      table.unique(['company_id', 'version'])
      table.unique(['id', 'company_id'])
      table.unique(['id', 'company_id', 'version'])
    })

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
    })

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
    this.schema.raw(
      'ALTER TABLE payments ADD CONSTRAINT payments_latest_attempt_fk FOREIGN KEY (latest_successful_attempt_id, id) REFERENCES payment_attempts(id, payment_id) DEFERRABLE INITIALLY DEFERRED'
    )

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

    this.schema.createTable('refunds', (table) => {
      table.bigIncrements('id').primary()
      table.uuid('reference').notNullable().unique()
      table.bigInteger('payment_id').notNullable()
      table.integer('booking_id').unsigned().notNullable()
      table.integer('company_id').unsigned().notNullable()
      table.integer('user_id').unsigned().notNullable().references('users.id')
      table.bigInteger('requested_amount_minor').notNullable()
      table.bigInteger('approved_amount_minor').notNullable()
      table.string('currency', 3).notNullable().defaultTo('SAR')
      table.text('reason').notNullable()
      table.string('source_cancellation_event', 100).notNullable()
      table
        .enum('status', ['requested', 'provider_pending', 'succeeded', 'failed', 'cancelled'])
        .notNullable()
        .defaultTo('requested')
      table.string('provider_refund_reference', 180).nullable()
      table.string('idempotency_key', 180).notNullable()
      table.integer('actor_user_id').unsigned().nullable().references('users.id')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('processed_at').nullable()
      table.unique(['payment_id', 'idempotency_key'])
      table.unique(['provider_refund_reference'])
      table
        .foreign(['payment_id', 'booking_id'])
        .references(['id', 'booking_id'])
        .inTable('payments')
      table
        .foreign(['payment_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('payments')
      table
        .foreign(['payment_id', 'user_id', 'company_id', 'booking_id'])
        .references(['id', 'user_id', 'company_id', 'booking_id'])
        .inTable('payments')
      table.check("currency = 'SAR'")
      table.check(
        'requested_amount_minor >= 0 AND approved_amount_minor >= 0 AND approved_amount_minor <= requested_amount_minor'
      )
    })

    this.schema.createTable('refund_attempts', (table) => {
      table.bigIncrements('id').primary()
      table.uuid('reference').notNullable().unique()
      table.bigInteger('refund_id').notNullable().references('refunds.id')
      table.string('provider', 40).notNullable()
      table.string('idempotency_key', 180).notNullable()
      table.string('request_fingerprint', 64).notNullable()
      table.bigInteger('requested_amount_minor').notNullable()
      table.string('currency', 3).notNullable()
      table.string('provider_refund_reference', 180).nullable()
      table
        .enum('status', ['created', 'provider_pending', 'succeeded', 'failed', 'unknown'])
        .notNullable()
        .defaultTo('created')
      table.string('failure_code', 100).nullable()
      table.string('failure_message', 240).nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.timestamp('processed_at').nullable()
      table.unique(['refund_id', 'provider', 'idempotency_key'])
      table.unique(['provider', 'provider_refund_reference'])
      table.unique(['id', 'refund_id'])
      table.check('requested_amount_minor >= 0')
      table.check("currency = 'SAR'")
    })

    this.schema.createTable('booking_cancellation_idempotency', (table) => {
      table.bigIncrements('id').primary()
      table.integer('actor_user_id').unsigned().notNullable().references('users.id')
      table.enum('actor_scope', ['customer', 'company']).notNullable()
      table.integer('company_id').unsigned().notNullable().references('companies.id')
      table.integer('booking_id').unsigned().notNullable().references('bookings.id')
      table.bigInteger('payment_id').notNullable().references('payments.id')
      table.bigInteger('refund_id').nullable().references('refunds.id')
      table.string('idempotency_key', 180).notNullable()
      table.string('request_fingerprint', 64).notNullable()
      table.bigInteger('refundable_amount_minor').notNullable()
      table.jsonb('result_snapshot').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.unique(['actor_user_id', 'actor_scope', 'idempotency_key'])
      table.check('refundable_amount_minor >= 0')
    })

    this.schema.createTable('payment_events', (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('payment_id').nullable().references('payments.id')
      table.bigInteger('refund_id').nullable().references('refunds.id')
      table.integer('booking_id').unsigned().nullable().references('bookings.id')
      table.integer('company_id').unsigned().nullable().references('companies.id')
      table.integer('actor_user_id').unsigned().nullable().references('users.id')
      table.string('action', 100).notNullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.index(['payment_id', 'created_at'])
      table.index(['refund_id', 'created_at'])
    })

    this.schema.createTable('reconciliation_records', (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('payment_id').nullable().references('payments.id')
      table.integer('company_id').unsigned().nullable().references('companies.id')
      table.string('provider', 40).notNullable()
      table.string('provider_reference', 180).notNullable()
      table.bigInteger('expected_amount_minor').nullable()
      table.bigInteger('reported_amount_minor').nullable()
      table.string('expected_currency', 3).nullable()
      table.string('reported_currency', 3).nullable()
      table.string('internal_status', 60).nullable()
      table.string('provider_status', 60).nullable()
      table
        .enum('result', [
          'matched',
          'amount_mismatch',
          'currency_mismatch',
          'unknown_provider_reference',
          'late_success',
          'refund_mismatch',
          'unresolved',
        ])
        .notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('last_checked_at').notNullable().defaultTo(this.now())
      table.timestamp('resolved_at').nullable()
      table.text('resolution_reason').nullable()
    })

    this.schema.createTable('booking_invoice_snapshots', (table) => {
      table.bigIncrements('id').primary()
      table.bigInteger('payment_id').notNullable().unique().references('payments.id')
      table.integer('booking_id').unsigned().notNullable().references('bookings.id')
      table.jsonb('snapshot').notNullable()
      table.bigInteger('amount_refunded_minor').notNullable().defaultTo(0)
      table
        .enum('status', ['receipt_available', 'partially_refunded', 'refunded'])
        .notNullable()
        .defaultTo('receipt_available')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()
      table.check('amount_refunded_minor >= 0')
      table
        .foreign(['payment_id', 'booking_id'])
        .references(['id', 'booking_id'])
        .inTable('payments')
    })

    this.schema.alterTable('bookings', (table) => {
      table
        .foreign(['cancellation_policy_version_id', 'company_id'])
        .references(['id', 'company_id'])
        .inTable('cancellation_policies')
    })
    this.schema.raw(`
      CREATE FUNCTION enforce_sprint6_financial_transitions() RETURNS trigger AS $$
      BEGIN
        IF TG_TABLE_NAME = 'payment_attempts' AND OLD.status <> NEW.status AND NOT (
          (OLD.status = 'created' AND NEW.status IN ('provider_pending','unknown','failed')) OR
          (OLD.status IN ('provider_pending','unknown','failed') AND NEW.status IN ('succeeded','failed','cancelled','expired'))
        ) THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_TRANSITION_INVALID' USING ERRCODE='check_violation'; END IF;
        IF TG_TABLE_NAME = 'payments' AND OLD.status <> NEW.status AND NOT (
          (OLD.status='pending' AND NEW.status='paid') OR
          (OLD.status='paid' AND NEW.status IN ('partially_refunded','refunded')) OR
          (OLD.status='partially_refunded' AND NEW.status IN ('partially_refunded','refunded'))
        ) THEN RAISE EXCEPTION 'PAYMENT_TRANSITION_INVALID' USING ERRCODE='check_violation'; END IF;
        IF TG_TABLE_NAME = 'refunds' AND OLD.status <> NEW.status AND NOT (
          (OLD.status='requested' AND NEW.status IN ('provider_pending','failed')) OR
          (OLD.status='provider_pending' AND NEW.status IN ('succeeded','failed')) OR
          (OLD.status='failed' AND NEW.status IN ('provider_pending','succeeded','failed'))
        ) THEN RAISE EXCEPTION 'REFUND_TRANSITION_INVALID' USING ERRCODE='check_violation'; END IF;
        IF TG_TABLE_NAME = 'refund_attempts' AND OLD.status <> NEW.status AND NOT (
          (OLD.status='created' AND NEW.status IN ('provider_pending','failed','unknown')) OR
          (OLD.status IN ('provider_pending','failed','unknown') AND NEW.status IN ('succeeded','failed','unknown'))
        ) THEN RAISE EXCEPTION 'REFUND_ATTEMPT_TRANSITION_INVALID' USING ERRCODE='check_violation'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER payment_attempt_transition BEFORE UPDATE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION enforce_sprint6_financial_transitions();
      CREATE TRIGGER payment_transition BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION enforce_sprint6_financial_transitions();
      CREATE TRIGGER refund_transition BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION enforce_sprint6_financial_transitions();
      CREATE TRIGGER refund_attempt_transition BEFORE UPDATE ON refund_attempts FOR EACH ROW EXECUTE FUNCTION enforce_sprint6_financial_transitions();

      CREATE FUNCTION enforce_payment_quote_snapshot() RETURNS trigger AS $$
      DECLARE b RECORD;
      BEGIN
        SELECT accepted_quote_id, accepted_quote_revision_id INTO b FROM bookings WHERE id=NEW.booking_id;
        IF NEW.quote_id IS DISTINCT FROM b.accepted_quote_id OR NEW.quote_revision_id IS DISTINCT FROM b.accepted_quote_revision_id THEN
          RAISE EXCEPTION 'PAYMENT_BOOKING_QUOTE_MISMATCH' USING ERRCODE='foreign_key_violation';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER payment_quote_snapshot BEFORE INSERT OR UPDATE OF booking_id,quote_id,quote_revision_id ON payments FOR EACH ROW EXECUTE FUNCTION enforce_payment_quote_snapshot();

      CREATE FUNCTION protect_receipt_snapshot() RETURNS trigger AS $$
      BEGIN
        IF NEW.payment_id <> OLD.payment_id OR NEW.booking_id <> OLD.booking_id OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.created_at <> OLD.created_at THEN
          RAISE EXCEPTION 'RECEIPT_SNAPSHOT_IMMUTABLE' USING ERRCODE='check_violation';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER receipt_snapshot_immutable BEFORE UPDATE ON booking_invoice_snapshots FOR EACH ROW EXECUTE FUNCTION protect_receipt_snapshot();
    `)
  }

  async down() {
    const used = await this.db.from('payments').first()
    if (used)
      throw new Error(
        'Sprint 6 rollback refused: financial history exists; archive/export it before rollback'
      )
    this.schema.raw('DROP FUNCTION IF EXISTS enforce_sprint6_financial_transitions() CASCADE')
    this.schema.raw('DROP FUNCTION IF EXISTS enforce_payment_quote_snapshot() CASCADE')
    this.schema.raw('DROP FUNCTION IF EXISTS protect_receipt_snapshot() CASCADE')
    this.schema.alterTable('bookings', (table) =>
      table.dropForeign(['cancellation_policy_version_id', 'company_id'])
    )
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT bookings_sprint6_money_check')
    this.schema.dropTable('booking_invoice_snapshots')
    this.schema.dropTable('reconciliation_records')
    this.schema.dropTable('payment_events')
    this.schema.dropTable('booking_cancellation_idempotency')
    this.schema.dropTable('refund_attempts')
    this.schema.dropTable('refunds')
    this.schema.dropTable('payment_webhook_events')
    this.schema.raw('ALTER TABLE payments DROP CONSTRAINT payments_latest_attempt_fk')
    this.schema.dropTable('payment_attempts')
    this.schema.dropTable('payments')
    this.schema.dropTable('cancellation_policies')
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT bookings_sprint6_owner_unique')
    this.schema.alterTable('bookings', (table) => {
      table.dropColumn('paid_total_minor')
      table.dropColumn('remaining_total_minor')
      table.dropColumn('cancellation_policy_version_id')
      table.dropColumn('cancellation_policy_snapshot')
      table.dropColumn('confirmed_at')
      table.dropColumn('cancelled_at')
    })
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT bookings_payment_status_check')
    this.schema.raw(
      "ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check CHECK (payment_status IN ('unpaid','paid','refunded'))"
    )
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT bookings_status_check')
    this.schema.raw(
      "UPDATE bookings SET status = 'cancelled' WHERE status IN ('partially_refunded','refunded')"
    )
    this.schema.raw(
      "ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending','accepted','rejected','expired','confirmed','cancelled','completed','payment_expired'))"
    )
  }
}
