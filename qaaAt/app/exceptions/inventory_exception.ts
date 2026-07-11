import DomainException from '#exceptions/domain_exception'

export default class InventoryException extends DomainException {
  constructor(message: string, code = 'INVENTORY_CONFLICT', status = 409) {
    super(message, status, code)
  }
}
