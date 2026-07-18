import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
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
  }

  async down() {
    this.schema.raw(
      'ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_accepted_quote_revision_fk'
    )
    this.schema.raw('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_accepted_quote_fk')
    this.schema.raw('ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_accepted_revision_fk')
    this.schema.raw('ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_current_revision_fk')
  }
}
