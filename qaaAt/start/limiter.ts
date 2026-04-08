import limiter from '@adonisjs/limiter/services/main'

export const authThrottle = limiter.define('auth', (ctx) => {
  return limiter
    .allowRequests(5)
    .every('1 minute')
    .blockFor('10 mins')
    .usingKey(`auth_${ctx.request.ip()}`)
})

export const resendVerificationThrottle = limiter.define('resendVerification', (ctx) => {
  const email = String(ctx.request.input('email', '')).toLowerCase().trim()

  return limiter
    .allowRequests(3)
    .every('10 minutes')
    .blockFor('30 mins')
    .usingKey(`resend_${ctx.request.ip()}_${email || 'anonymous'}`)
})

export const bookingCreationThrottle = limiter.define('bookingCreate', (ctx) => {
  const key = ctx.auth.user ? `booking_${ctx.auth.user.id}` : `booking_ip_${ctx.request.ip()}`

  return limiter.allowRequests(10).every('10 minutes').blockFor('15 mins').usingKey(key)
})
