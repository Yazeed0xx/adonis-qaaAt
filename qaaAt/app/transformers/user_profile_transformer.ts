import { BaseTransformer } from '@adonisjs/core/transformers'
import type UserProfile from '#models/user_profile'

export default class UserProfileTransformer extends BaseTransformer<UserProfile> {
  toObject() {
    return this.pick(this.resource, ['id', 'firstName', 'lastName', 'phone', 'address', 'avatar'])
  }
}
