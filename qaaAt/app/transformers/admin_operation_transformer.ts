export function serializeAdminCategory(row: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function serializeAdminAmenity(row: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    group: row.group,
    isSearchable: row.is_searchable,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function serializePaymentDispute(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    reference: row.reference,
    paymentId: String(row.payment_id),
    refundId: row.refund_id === null ? null : String(row.refund_id),
    bookingId: row.booking_id,
    companyId: row.company_id,
    userId: row.user_id,
    openedByAdminUserId: row.opened_by_admin_user_id,
    resolvedByAdminUserId: row.resolved_by_admin_user_id,
    status: row.status,
    reason: row.reason,
    resolution: row.resolution,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function serializeAuditLog(row: Record<string, unknown>, scope: string) {
  return {
    id: String(row.id),
    scope,
    actorUserId: row.actor_user_id ?? row.admin_user_id ?? null,
    companyId: row.company_id ?? null,
    action: row.action,
    targetType: row.target_type ?? (scope === 'booking' ? 'booking' : null),
    targetId: row.target_id ?? row.booking_id ?? null,
    previousStatus: row.previous_status ?? null,
    nextStatus: row.next_status ?? null,
    reason: row.reason ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.created_at,
  }
}
