import type { HttpContext } from '@adonisjs/core/http'
import pushInstallationService from '#services/push_installation_service'
import { registerPushInstallationValidator } from '#validators/push_installation_validator'
import PushInstallationTransformer from '#transformers/push_installation_transformer'

export default class PushInstallationsController {
  async store({ auth, companyContext, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(registerPushInstallationValidator)
    const installation = await pushInstallationService.registerCompany(
      user.id,
      companyContext.companyId,
      payload
    )

    return response.ok({
      message: 'Push installation registered successfully',
      data: await serialize.withoutWrapping(PushInstallationTransformer.transform(installation)),
    })
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    await pushInstallationService.revoke(user.id, String(params.installationId))
    return response.noContent()
  }
}
