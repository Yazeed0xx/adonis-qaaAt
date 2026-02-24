import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, hasOne, hasMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import UserProfile from '#models/user_profile'
import Company from '#models/company'
import Booking from '#models/booking'
import Notification from '#models/notification'
import type { HasOne, HasMany } from '@adonisjs/lucid/types/relations'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userName: string | null

  @column()
  declare email: string

  @column()
  declare userType: 'company' | 'user' | 'admin'

  @column({ serializeAs: null })
  declare password: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime()
  declare emailVerifiedAt: DateTime | null

  @column()
  declare emailVerificationToken: string | null

  @column.dateTime()
  declare emailVerificationExpiresAt: DateTime | null

  get isEmailVerified(): boolean {
    return this.emailVerifiedAt !== null
  }

  @hasOne(() => UserProfile)
  declare userProfile: HasOne<typeof UserProfile>

  @hasOne(() => Company)
  declare company: HasOne<typeof Company>

  @hasMany(() => Booking)
  declare bookings: HasMany<typeof Booking>

  @hasMany(() => Notification)
  declare notifications: HasMany<typeof Notification>

  static accessTokens = DbAccessTokensProvider.forModel(User)
}
