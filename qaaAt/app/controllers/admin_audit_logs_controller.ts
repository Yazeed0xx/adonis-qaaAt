import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { AdminAuditLogService } from '#services/admin_audit_log_service'
import { serializeAuditLog } from '#transformers/admin_operation_transformer'
import { adminAuditQueryValidator } from '#validators/admin_operation_validator'

@inject()
export default class AdminAuditLogsController {
  constructor(private auditLogs: AdminAuditLogService) {}

  async index({ request, response }: HttpContext) {
    const input = await request.validateUsing(adminAuditQueryValidator, { data: request.qs() })
    const rows = await this.auditLogs.list(input)
    return response.ok({
      data: rows.all().map((row) => serializeAuditLog(row, input.scope)),
      metadata: rows.getMeta(),
    })
  }
}
