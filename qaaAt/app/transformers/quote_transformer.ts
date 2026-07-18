type Row = Record<string, any>

const pick = (row: Row, keys: readonly string[]) =>
  Object.fromEntries(keys.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]))

const lineItem = (row: Row) =>
  pick(row, [
    'id',
    'item_type',
    'description_ar',
    'description_en',
    'quantity',
    'unit_price_minor',
    'subtotal_minor',
    'discount_minor',
    'vat_rate_bps',
    'vat_minor',
    'total_minor',
    'currency',
    'prices_include_vat',
    'sort_order',
  ])

const revision = (row: Row) => ({
  ...pick(row, [
    'id',
    'revision_number',
    'status',
    'subtotal_minor',
    'discount_minor',
    'vat_minor',
    'total_minor',
    'currency',
    'prices_include_vat',
    'vat_rate_bps',
    'deposit_percent',
    'deposit_minor',
    'remaining_minor',
    'expires_at',
    'sent_at',
    'created_at',
  ]),
  ...(Array.isArray(row.line_items) ? { line_items: row.line_items.map(lineItem) } : {}),
})

const customerQuote = (row: Row) => ({
  ...pick(row, [
    'id',
    'reference',
    'company_id',
    'venue_id',
    'space_id',
    'inquiry_id',
    'visit_request_id',
    'booking_id',
    'status',
    'current_revision_id',
    'accepted_revision_id',
    'starts_at',
    'ends_at',
    'start_local',
    'end_local',
    'timezone',
    'space_name_ar',
    'space_name_en',
    'venue_name_ar',
    'venue_name_en',
    'customer_request_snapshot',
    'sent_at',
    'accepted_at',
    'declined_at',
    'withdrawn_at',
    'expired_at',
    'created_at',
    'updated_at',
  ]),
  ...(Array.isArray(row.revisions) ? { revisions: row.revisions.map(revision) } : {}),
})

export const QuoteTransformer = {
  customer: customerQuote,
  customerCollection(rows: Row[]) {
    return rows.map(customerQuote)
  },
}
