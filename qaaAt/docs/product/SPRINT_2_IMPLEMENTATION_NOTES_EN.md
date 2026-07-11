# Sprint 2 implementation decisions

- Existing `halls` and `bookings.hall_id` remain unchanged and authoritative for current booking flows.
- Every Hall maps to one additive Venue and Space through `spaces.legacy_hall_id`.
- Legacy `hall.location` is free-form and is preserved verbatim in `venues.legacy_location`; it is not treated as the structured `district` field.
- Non-deleted legacy Halls backfill as `published`; `is_available` is preserved independently as `legacy_is_available`. Deleted Halls backfill as `archived`.
- Public Space preview filters mapped Spaces by `legacy_is_available`. Broad public Space discovery is deferred to Sprint 3.
- Hall endpoints are the only compatibility write source. New Space endpoints reject mapped legacy mutations.
- Editing a published new Space atomically returns it to `pending_review`, clears its publication attribution, records the transition, and hides it from public preview until an admin republishes it.
- New records use Arabic/English localized values with Arabic-first response fallback. Verbatim legacy values are compatibility-only and cannot be written through new endpoints.
- Media writes are not exposed until controlled upload exists. Legacy Hall references are marked `legacy_imported`; arbitrary remote URLs are not accepted for new records.
- Availability rules, external reservations, pricing, quote, payment, and booking-state changes are outside Sprint 2.
