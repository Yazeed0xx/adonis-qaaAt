const contentUrl = (id: number) => `/api/space-media/${id}/content`

export function serializeSpaceMedia(row: any, privatePreview = false) {
  return {
    id: row.id,
    spaceId: row.space_id ?? row.spaceId,
    type: row.media_type ?? row.mediaType,
    moderationStatus: row.moderation_status ?? row.moderationStatus,
    altTextAr: row.alt_text_ar ?? row.altTextAr ?? null,
    altTextEn: row.alt_text_en ?? row.altTextEn ?? null,
    sortOrder: row.sort_order ?? row.sortOrder,
    isCover: row.is_cover ?? row.isCover,
    contentUrl: privatePreview
      ? `/api/companies/spaces/${row.space_id ?? row.spaceId}/media/${row.id}/content`
      : contentUrl(row.id),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  }
}

export function serializeModerationMedia(row: any) {
  return {
    ...serializeSpaceMedia(row),
    contentUrl: `/api/admin/space-media/${row.id}/content`,
    space: { id: row.space_id, name: row.space_name_ar ?? row.space_name_en },
    venue: { name: row.venue_name_ar ?? row.venue_name_en },
    company: { id: row.company_id, status: row.company_status },
    width: row.width,
    height: row.height,
    byteSize: String(row.byte_size),
    mimeType: row.mime_type,
  }
}
