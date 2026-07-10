import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import { errors as authErrors } from '@adonisjs/auth'
import { errors as lucidErrors } from '@adonisjs/lucid'
import { errors as vineErrors } from '@vinejs/vine'
import DomainException from '#exceptions/domain_exception'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction
  protected ignoreStatuses = [400, 401, 403, 404, 409, 422]
  protected ignoreCodes = ['E_VALIDATION_ERROR', 'E_UNAUTHORIZED_ACCESS']

  protected context(ctx: HttpContext) {
    return {
      requestId: ctx.request.id(),
      userId: ctx.auth.user?.id,
      ip: ctx.request.ip(),
    }
  }

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    if (error instanceof vineErrors.E_VALIDATION_ERROR) {
      return ctx.response.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.messages,
        },
      })
    }

    if (error instanceof DomainException) {
      return ctx.response.status(error.status).send({
        error: {
          code: error.code,
          message: error.message,
        },
      })
    }

    if (error instanceof lucidErrors.E_ROW_NOT_FOUND) {
      return ctx.response.status(404).send({
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: `${error.model?.name || 'Resource'} not found`,
        },
      })
    }

    if (error instanceof authErrors.E_INVALID_CREDENTIALS) {
      return ctx.response.status(400).send({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: error.message,
        },
      })
    }

    if (error instanceof authErrors.E_UNAUTHORIZED_ACCESS) {
      return ctx.response.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: error.message,
        },
      })
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
