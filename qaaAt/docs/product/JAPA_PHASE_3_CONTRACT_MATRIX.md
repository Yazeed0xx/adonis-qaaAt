# Japa Phase 3 Contract Matrix

## Authority and scope

This matrix maps the approved Venue, Space, discovery, legacy Hall, and controlled-media contracts
from `BACKEND_MVP_IMPLEMENTATION_HANDOFF_EN.md` and
`CONTROLLED_SPACE_MEDIA_IMPLEMENTATION_NOTES_EN.md` to their canonical Japa owners.

Functional tests enter through the real HTTP boundary. Direct service execution is limited to
database invariants, concurrency, bounded-query behavior, and cleanup processing in `integration`.
The disposable PostgreSQL database and private Drive fake are the only stateful test boundaries.

## Venue and Space HTTP contracts

| Contract                                                       | Canonical test                                  | Durable proof                                              |
| -------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Owner creates, lists, reads, and updates a localized Venue     | `tests/functional/spaces/authorization.spec.ts` | Exact status/envelope and persisted update                 |
| `spaces.view` permits reads but not Venue mutation             | `tests/functional/spaces/authorization.spec.ts` | 403 and unchanged Venue row                                |
| Cross-tenant Venue reads are hidden                            | `tests/functional/spaces/authorization.spec.ts` | 404                                                        |
| Space creation is tenant-scoped and requires `spaces.manage`   | `tests/functional/spaces/authorization.spec.ts` | 403/404 and zero Space writes                              |
| Localization, booking mode, and category detail validation     | `tests/functional/spaces/authorization.spec.ts` | 422 and zero Space writes                                  |
| Category changes replace incompatible normalized details       | `tests/functional/spaces/lifecycle.spec.ts`     | Exact detail-table state after both transitions            |
| Provider and admin publication lifecycle                       | `tests/functional/spaces/lifecycle.spec.ts`     | Draft, review, changes, publish, suspend, restore, archive |
| Failed published edit rolls back content and publication state | `tests/functional/spaces/lifecycle.spec.ts`     | 422, unchanged state, still public                         |
| Editing a published Space returns it to review                 | `tests/functional/spaces/lifecycle.spec.ts`     | Hidden public read and moderation event                    |
| Moderation reasons and transitions are audited                 | `tests/functional/spaces/lifecycle.spec.ts`     | Ordered event facts and reason                             |

## Legacy Hall compatibility

| Contract                                                        | Canonical test                                 | Durable proof                                   |
| --------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Public Hall list/show and company list/create remain compatible | `tests/functional/spaces/legacy_halls.spec.ts` | Legacy response envelopes and numeric pricing   |
| Deleted/banned owner hides Hall list, detail, and availability  | `tests/functional/spaces/legacy_halls.spec.ts` | Empty list and 404 reads                        |
| Hall paths remain present in served OpenAPI 3.1                 | `tests/functional/spaces/legacy_halls.spec.ts` | Operation IDs and bearer security               |
| Mapped Space rejects reverse edits and direct moderation        | `tests/functional/spaces/legacy_halls.spec.ts` | Stable 409 domain codes                         |
| Allowlisted Hall fields synchronize to mapped Space             | `tests/integration/spaces/legacy_sync.spec.ts` | Name, capacity, availability, publication state |
| Failed synchronized update is atomic                            | `tests/integration/spaces/legacy_sync.spec.ts` | Hall and Space both unchanged                   |

## Public discovery

| Contract                                                                      | Canonical test                                     | Durable proof                                                     |
| ----------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| Only eligible published Spaces are returned                                   | `tests/functional/discovery/catalog.spec.ts`       | Every non-public Space, Venue, Company, and legacy state excluded |
| Controlled category, amenity, city, capacity, pricing-mode, and price filters | `tests/functional/discovery/catalog.spec.ts`       | One exact safe summary; no company ID                             |
| All controlled MVP categories are discoverable                                | `tests/functional/discovery/catalog.spec.ts`       | Category-aware query for every seeded slug                        |
| Unknown slugs and incomplete availability ranges are rejected                 | `tests/functional/discovery/catalog.spec.ts`       | Stable 422 domain codes                                           |
| Arabic, English, legacy, and literal wildcard search                          | `tests/functional/discovery/search.spec.ts`        | Exact result IDs                                                  |
| Relevance tiers and newest ordering are deterministic                         | `tests/functional/discovery/search.spec.ts`        | Exact ordered IDs                                                 |
| Signed-bigint minor-unit filters remain exact                                 | `tests/functional/discovery/search.spec.ts`        | Value above JS safe integer serialized unchanged                  |
| Capacity/page/limit and money syntax are bounded                              | `tests/functional/discovery/search.spec.ts`        | 422 matrix                                                        |
| Public availability filter returns only authoritative available Spaces        | `tests/functional/discovery/availability.spec.ts`  | Exact public response and exclusion                               |
| Candidate batching paginates without gaps or false next pages                 | `tests/integration/discovery/query_budget.spec.ts` | 25 unique results across four pages                               |
| Query count is constant within one batch                                      | `tests/integration/discovery/query_budget.spec.ts` | Equal small/large query counts, maximum six                       |
| Unresolved work is bounded                                                    | `tests/integration/discovery/query_budget.spec.ts` | `SPACE_DISCOVERY_WORK_LIMIT` after 2,000 candidates               |

## Controlled Space media

| Contract                                                                            | Canonical test                                                                                 | Durable proof                                              |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Exactly one verified JPEG/PNG/WebP, maximum validation boundary                     | `tests/functional/media/upload.spec.ts`                                                        | Decode-derived MIME/dimensions and no failed writes        |
| Client filename/MIME cannot control the storage key or canonical type               | `tests/functional/media/upload.spec.ts`                                                        | Tenant-prefixed UUID key kept out of response              |
| Authentication, admin role, active membership, permission, tenant, and legacy gates | `tests/functional/media/access.spec.ts`                                                        | 401/403/404 and unchanged media/audit state                |
| Maximum 20 active controlled images                                                 | Functional error in `access.spec.ts`; race invariant in `integration/media/invariants.spec.ts` | 409 plus exactly 20 concurrent winners                     |
| Moderation gates cover selection and public content                                 | `tests/functional/media/access.spec.ts`                                                        | Pending 404, approved public headers, invalid repeat 409   |
| Rejection requires a reason and audits only success                                 | `tests/functional/media/moderation.spec.ts`                                                    | 422 without event; rejected event after success            |
| List, metadata, reorder, cover, and delete endpoints are coherent                   | `tests/functional/media/management.spec.ts`                                                    | Ordered response, cover promotion, complete audit sequence |
| Company/admin previews remain private; public delivery is immutable and `nosniff`   | `tests/functional/media/access.spec.ts`                                                        | Exact cache and content headers                            |
| Concurrent cover selection preserves one active cover                               | `tests/integration/media/invariants.spec.ts`                                                   | Both operations settle; one durable cover                  |
| Delete commits soft-delete, audit, and cleanup outbox before storage cleanup        | `tests/integration/media/invariants.spec.ts`                                                   | Rollback on wrong tenant; atomic intent on success         |
| Cleanup processing is idempotent and records retry state                            | `tests/integration/media/invariants.spec.ts`                                                   | One delete call and persisted failed attempt               |

## Generated route typing

`tests/types/api_client.d.ts` extends Japa's route registry with a `Pick` of every rewritten Phase 2
and Phase 3 route. Rewritten tests use `client.visit()` where a named route is the contract. Literal
URLs remain only where the literal compatibility path or encoded query string is itself under test.
Response ambiguity is handled with runtime shape guards in tests; broad casts are prohibited.

## Replacement gate

The legacy monoliths are replaced only when all focused files pass:

- `tests/functional/spaces.spec.ts` → `functional/spaces/*` and `integration/spaces/*`;
- `tests/functional/halls.spec.ts` → `functional/spaces/legacy_halls.spec.ts`;
- `tests/functional/space_discovery.spec.ts` → `functional/discovery/*` and
  `integration/discovery/*`;
- `tests/functional/space_media.spec.ts` → `functional/media/*` and `integration/media/*`.
