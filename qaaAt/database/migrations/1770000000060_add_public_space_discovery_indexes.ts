import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(`CREATE INDEX spaces_public_discovery_index
      ON spaces (created_at DESC, id DESC)
      WHERE publication_status = 'published' AND deleted_at IS NULL`)
    this.schema.raw(
      `CREATE INDEX venues_public_city_index ON venues (LOWER(city), id) WHERE deleted_at IS NULL`
    )
    this.schema.raw(`CREATE INDEX rate_plans_public_discovery_index
      ON rate_plans (space_id, pricing_mode, price_minor)
      WHERE is_active = true AND archived_at IS NULL`)
  }

  async down() {
    this.schema.raw('DROP INDEX IF EXISTS rate_plans_public_discovery_index')
    this.schema.raw('DROP INDEX IF EXISTS venues_public_city_index')
    this.schema.raw('DROP INDEX IF EXISTS spaces_public_discovery_index')
  }
}
