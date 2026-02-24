import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import User from '#models/user'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'

export class EmailVerificationService {
  private static TOKEN_LENGTH = 64
  private static TOKEN_EXPIRY_HOURS = 24

  /**
   * Generate a cryptographically secure random token
   */
  private generateToken(): string {
    return randomBytes(EmailVerificationService.TOKEN_LENGTH / 2).toString('hex')
  }

  /**
   * Get the verification URL for a token
   */
  private getVerificationUrl(token: string): string {
    const baseUrl = env.get('APP_URL')
    return `${baseUrl}/api/users/verify-email/${token}`
  }

  /**
   * Send verification email to user
   */
  async sendVerificationEmail(user: User): Promise<void> {
    const token = this.generateToken()
    const expiresAt = DateTime.now().plus({ hours: EmailVerificationService.TOKEN_EXPIRY_HOURS })

    user.emailVerificationToken = token
    user.emailVerificationExpiresAt = expiresAt
    await user.save()

    const verificationUrl = this.getVerificationUrl(token)

    await mail.send((message) => {
      message
        .to(user.email)
        .subject('Verify your email address - QaaAt')
        .html(this.getEmailHtml(user, verificationUrl))
    })
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<User> {
    const user = await User.query()
      .where('emailVerificationToken', token)
      .whereNull('deletedAt')
      .first()

    if (!user) {
      throw new Error('Invalid verification token')
    }

    if (user.emailVerificationExpiresAt && user.emailVerificationExpiresAt < DateTime.now()) {
      throw new Error('Verification token has expired')
    }

    if (user.emailVerifiedAt) {
      throw new Error('Email is already verified')
    }

    user.emailVerifiedAt = DateTime.now()
    user.emailVerificationToken = null
    user.emailVerificationExpiresAt = null
    await user.save()

    return user
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

    await this.sendVerificationEmail(user)
  }

  /**
   * Generate email HTML content
   */
  private getEmailHtml(user: User, verificationUrl: string): string {
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
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Hall Booking Platform</p>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">Welcome to QaaAt!</h2>

    <p>Hi${user.userName ? ` ${user.userName}` : ''},</p>

    <p>Thank you for registering with QaaAt. Please verify your email address by clicking the button below:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Verify Email Address</a>
    </div>

    <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
    <p style="background: #f5f5f5; padding: 10px; border-radius: 5px; word-break: break-all; font-size: 12px; color: #666;">${verificationUrl}</p>

    <p style="color: #999; font-size: 13px; margin-top: 30px;">This link will expire in 24 hours. If you didn't create an account with QaaAt, you can safely ignore this email.</p>
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
