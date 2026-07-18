import { createHash, randomInt } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import InvalidInputException from '#exceptions/invalid_input_exception'
import InvalidStateException from '#exceptions/invalid_state_exception'
import SendMailJob from '#jobs/send_mail_job'
import User from '#models/user'
import { escapeHtml } from '#lib/escape_html'

export class EmailVerificationService {
  private static OTP_LENGTH = 6
  private static OTP_EXPIRY_MINUTES = 10
  private static RESEND_COOLDOWN_MINUTES = 5

  /**
   * Generate a cryptographically secure numeric OTP
   */
  private generateOtp(): string {
    const max = 10 ** EmailVerificationService.OTP_LENGTH
    return String(randomInt(0, max)).padStart(EmailVerificationService.OTP_LENGTH, '0')
  }

  /**
   * Hash verification codes before storing them in the database
   */
  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex')
  }

  /**
   * Infer the last time a code was issued from its expiration timestamp
   */
  private getTokenIssuedAt(user: User): DateTime | null {
    return (
      user.emailVerificationExpiresAt?.minus({
        minutes: EmailVerificationService.OTP_EXPIRY_MINUTES,
      }) ?? null
    )
  }

  /**
   * Send verification email to user
   */
  async sendVerificationEmail(user: User): Promise<void> {
    const code = this.generateOtp()
    const expiresAt = DateTime.now().plus({ minutes: EmailVerificationService.OTP_EXPIRY_MINUTES })

    user.emailVerificationToken = this.hashCode(code)
    user.emailVerificationExpiresAt = expiresAt
    await user.save()

    await SendMailJob.dispatch({
      to: user.email,
      subject: 'Your QaaAt verification code',
      html: this.getEmailHtml(user, code),
    }).toQueue('emails')
  }

  /**
   * Verify email with OTP code
   */
  async verifyEmail(email: string, code: string): Promise<User> {
    const hashedCode = this.hashCode(code)

    return db.transaction(async (trx) => {
      const user = await User.query({ client: trx })
        .where('email', email)
        .whereNull('deletedAt')
        .forUpdate()
        .first()

      if (!user) {
        throw new InvalidInputException('Invalid verification code', 'INVALID_VERIFICATION_CODE')
      }

      if (user.emailVerifiedAt) {
        throw new InvalidStateException('Email is already verified', 'EMAIL_ALREADY_VERIFIED')
      }

      if (!user.emailVerificationToken || user.emailVerificationToken !== hashedCode) {
        throw new InvalidInputException('Invalid verification code', 'INVALID_VERIFICATION_CODE')
      }

      if (user.emailVerificationExpiresAt && user.emailVerificationExpiresAt < DateTime.now()) {
        throw new InvalidInputException(
          'Verification code has expired',
          'EXPIRED_VERIFICATION_CODE'
        )
      }

      user.useTransaction(trx)
      user.emailVerifiedAt = DateTime.now()
      user.emailVerificationToken = null
      user.emailVerificationExpiresAt = null
      await user.save()

      return user
    })
  }

  /**
   * Resend verification email
   */
  async resendVerification(email: string): Promise<void> {
    const user = await User.query().where('email', email).whereNull('deletedAt').first()

    if (!user) {
      // Don't reveal if user exists or not
      return
    }

    if (user.emailVerifiedAt) {
      // Don't reveal that the email exists and is already verified
      return
    }

    const issuedAt = this.getTokenIssuedAt(user)
    if (
      user.emailVerificationToken &&
      issuedAt &&
      issuedAt.plus({ minutes: EmailVerificationService.RESEND_COOLDOWN_MINUTES }) > DateTime.now()
    ) {
      return
    }

    await this.sendVerificationEmail(user)
  }

  /**
   * Generate email HTML content
   */
  private getEmailHtml(user: User, code: string): string {
    const safeUserName = user.userName ? escapeHtml(user.userName) : ''
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">QaaAt</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Venue and Space Booking Platform</p>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">Welcome to QaaAt!</h2>

    <p>Hi${safeUserName ? ` ${safeUserName}` : ''},</p>

    <p>Thank you for registering with QaaAt. Use the verification code below to confirm your email address:</p>

    <div style="text-align: center; margin: 30px 0;">
      <div style="display: inline-block; background: #f5f5f5; border: 1px dashed #c7c7c7; border-radius: 8px; padding: 18px 24px; font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #333;">
        ${code}
      </div>
    </div>

    <p style="color: #666; font-size: 14px;">Enter this code in the QaaAt app to complete verification.</p>

    <p style="color: #999; font-size: 13px; margin-top: 30px;">This code will expire in ${EmailVerificationService.OTP_EXPIRY_MINUTES} minutes. If you didn't create an account with QaaAt, you can safely ignore this email.</p>
  </div>

  <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
    <p>&copy; ${new Date().getFullYear()} QaaAt. All rights reserved.</p>
  </div>
</body>
</html>
`
  }
}

export default new EmailVerificationService()
