import { belongsTo, hasOne, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasOne, HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import { CompanySchema } from '#database/schema'
import User from '#models/user'
import CompanyProfile from '#models/company_profile'
import CompanyMembership from '#models/company_membership'
import CompanyInvitation from '#models/company_invitation'
import Venue from '#models/venue'
import Space from '#models/space'
import PaymentDispute from '#models/payment_dispute'

export default class Company extends CompanySchema {
  declare id: number

  declare city: string

  declare status: string

  declare createdAt: DateTime

  declare updatedAt: DateTime | null

  get isApproved(): boolean {
    return this.status === 'approved'
  }

  get isPending(): boolean {
    return this.status === 'pending'
  }

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'approvedBy' })
  declare approvedByAdmin: BelongsTo<typeof User>

  @hasOne(() => CompanyProfile, { foreignKey: 'userId', localKey: 'userId' })
  declare companyProfile: HasOne<typeof CompanyProfile>

  @hasMany(() => CompanyMembership)
  declare memberships: HasMany<typeof CompanyMembership>

  @hasMany(() => CompanyInvitation)
  declare invitations: HasMany<typeof CompanyInvitation>

  @hasMany(() => Venue)
  declare venues: HasMany<typeof Venue>

  @hasMany(() => Space)
  declare spaces: HasMany<typeof Space>

  @hasMany(() => PaymentDispute)
  declare paymentDisputes: HasMany<typeof PaymentDispute>
}
