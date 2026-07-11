import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { hasOne, hasMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import { UserSchema } from '#database/schema'
import UserProfile from '#models/user_profile'
import Company from '#models/company'
import Booking from '#models/booking'
import Notification from '#models/notification'
import PushInstallation from '#models/push_installation'
import type { HasOne, HasMany } from '@adonisjs/lucid/types/relations'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(UserSchema, AuthFinder) {
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

  @hasMany(() => PushInstallation)
  declare pushInstallations: HasMany<typeof PushInstallation>

  static accessTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: '30 days',
  })
}
