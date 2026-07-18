# Controlled Space Media Implementation Notes

Controlled image upload is implemented for Space-only records. Mapped legacy Spaces remain read-only and Hall image strings remain authoritative.

## Boundary and validation

- Originals use the private AdonisJS Drive disk under server-generated `spaces/{companyId}/{spaceId}/{uuid}.{ext}` keys. Keys and disk paths never appear in client contracts.
- Multipart field `image` accepts exactly one JPEG, PNG, or WebP image, maximum 10 MB. Sharp performs a complete decode (`metadata` plus `stats`) without recompression. The server derives canonical MIME/extension and dimensions from decoded metadata and rejects empty, corrupt, truncated, unsupported, animated/multi-frame, over-12,000-pixel dimensions, or over-40-million-pixel images.
- Optional `altTextAr` and `altTextEn` are trimmed and limited to 240 characters. New rows are `controlled_storage` and `pending`; maximum active controlled images is 20.

## Lifecycle

Company members need an active selected membership and `spaces.manage` for mutations (`spaces.view` for list/preview). Draft, changes-requested, pending-review, and published Space media may be managed; suspended/archived Spaces and mapped legacy Spaces reject mutations. Rejected media is not resubmitted in this MVP: delete it and upload a replacement.

Moderation is independent of Space publication. Only `pending -> approved` and `pending -> rejected` are accepted. Every successful upload, metadata edit, reorder, cover selection, moderation transition, and deletion writes a media audit event in the same transaction.

Only approved media on an eligible published Space, non-deleted Venue, and approved/non-deleted Company streams publicly. Company previews and admin previews are private/no-store. Public content is immutable-cacheable, uses canonical `Content-Type`, server-owned inline filename, `nosniff`, and ETag.

## Consistency and cleanup

Space row locks serialize the 20-image limit, reorder/delete, cover changes, and moderation races. The partial unique index remains the final one-cover authority. Deleting a cover promotes the next approved controlled image deterministically.

Storage writes occur before the database transaction and are compensated on database failure. Media soft deletion, its audit event, and an idempotent cleanup-outbox row commit atomically before any physical delete attempt. Immediate deletion is only a latency optimization; the scheduled worker is authoritative and claims bounded rows with `FOR UPDATE SKIP LOCKED`, validates the key against the exact media-owned key and tenant/Space prefix, and records processed or bounded retry state. Production S3/R2 selection remains an external deployment decision and is intentionally not configured here.
