import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS bookings_availability_index ON bookings (hall_id, booking_date, status, deleted_at)'
    )
    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS bookings_user_listing_index ON bookings (user_id, deleted_at, created_at)'
    )
    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS bookings_status_expires_index ON bookings (status, expires_at)'
    )

    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS companies_status_index ON companies (status)'
    )
    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS companies_deleted_at_index ON companies (deleted_at)'
    )
    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS companies_user_id_index ON companies (user_id)'
    )

    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS halls_company_listing_index ON halls (company_id, deleted_at, created_at)'
    )
    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS halls_city_index ON halls (city, deleted_at)'
    )
    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS halls_availability_index ON halls (is_available, deleted_at)'
    )

    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS users_type_deleted_index ON users (user_type, deleted_at)'
    )
    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS users_deleted_at_index ON users (deleted_at)'
    )

    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS notifications_user_read_index ON notifications (user_id, read_at, created_at)'
    )
  }

  async down() {
    await this.db.rawQuery('DROP INDEX IF EXISTS bookings_availability_index')
    await this.db.rawQuery('DROP INDEX IF EXISTS bookings_user_listing_index')
    await this.db.rawQuery('DROP INDEX IF EXISTS bookings_status_expires_index')
    await this.db.rawQuery('DROP INDEX IF EXISTS companies_status_index')
    await this.db.rawQuery('DROP INDEX IF EXISTS companies_deleted_at_index')
    await this.db.rawQuery('DROP INDEX IF EXISTS companies_user_id_index')
    await this.db.rawQuery('DROP INDEX IF EXISTS halls_company_listing_index')
    await this.db.rawQuery('DROP INDEX IF EXISTS halls_city_index')
    await this.db.rawQuery('DROP INDEX IF EXISTS halls_availability_index')
    await this.db.rawQuery('DROP INDEX IF EXISTS users_type_deleted_index')
    await this.db.rawQuery('DROP INDEX IF EXISTS users_deleted_at_index')
    await this.db.rawQuery('DROP INDEX IF EXISTS notifications_user_read_index')
  }
}
