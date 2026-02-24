import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasOne, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasOne, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import CompanyProfile from '#models/company_profile'
import Hall from '#models/hall'
import Service from '#models/service'

export default class Company extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare taxId: string | null

  @column()
  declare registrationNumber: string | null

  @column()
  declare registrationNumberPdf: string | null

  @column()
  declare businessLicense: string | null

  @column()
  declare contactPerson: string | null

  @column()
  declare businessAddress: string | null

  @column()
  declare city: string

  @column()
  declare userId: number

  @column()
  declare status: 'pending' | 'approved' | 'rejected' | 'suspended'

  @column.dateTime()
  declare approvedAt: DateTime | null

  @column()
  declare approvedBy: number | null

  @column()
  declare rejectionReason: string | null

  @column.dateTime()
  declare rejectedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @column.dateTime()
  declare deletedAt: DateTime | null

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

  @hasMany(() => Hall)
  declare halls: HasMany<typeof Hall>

  @hasMany(() => Service)
  declare services: HasMany<typeof Service>
}
