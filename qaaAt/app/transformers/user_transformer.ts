import { BaseTransformer } from '@adonisjs/core/transformers'
import type User from '#models/user'
import UserProfileTransformer from '#transformers/user_profile_transformer'

export default class UserTransformer extends BaseTransformer<User> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'userName',
        'email',
        'userType',
        'createdAt',
        'updatedAt',
      ]),
      isEmailVerified: this.resource.isEmailVerified,
      userProfile: UserProfileTransformer.transform(this.whenLoaded(this.resource.userProfile)),
    }
  }

  forAdminView() {
    return {
      ...this.toObject(),
      deletedAt: this.resource.deletedAt,
      emailVerifiedAt: this.resource.emailVerifiedAt,
    }
  }
}
