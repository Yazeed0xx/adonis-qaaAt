import paymentConfig from '#config/payment'
import fakePaymentProvider from '#services/fake_payment_provider'
import InventoryException from '#exceptions/inventory_exception'

export function paymentProvider() {
  if (paymentConfig.driver === 'fake' && paymentConfig.isFakeAllowed) return fakePaymentProvider
  throw new InventoryException(
    'Payment provider is unavailable',
    'PAYMENT_PROVIDER_UNAVAILABLE',
    503
  )
}
