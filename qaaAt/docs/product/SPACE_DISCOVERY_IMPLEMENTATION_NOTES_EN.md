# Public Space discovery implementation notes

`GET /api/spaces` is the additive customer discovery endpoint for published rentable Spaces. The legacy `GET /api/halls` contract is unchanged. A legacy Hall has one mapped Space, so it appears once in Space discovery; Space-only records require no synthetic Hall.

## Contract

Pagination uses `page` and `limit`; the default limit is 20, `page` is capped at 10,000, and `limit` at 50. Values are positive integers only. Ordering always ends with descending Space ID for deterministic ties. Availability-filtered pages scan candidates in the requested deterministic sort order in batches of 200, up to 10 batches (2,000 candidates) per request, until `page × limit + 1` available results are found or the candidate set is exhausted. `hasNextPage` is true only when that extra reachable result was found. If the work ceiling prevents a truthful answer, the endpoint returns `SPACE_DISCOVERY_WORK_LIMIT` (422).

Supported sorts are `relevance`, `newest`, `capacity`, `price_asc`, and `price_desc`. With `q`, relevance ranks exact Space-name matches, name prefixes, name substrings, then description-only matches across Arabic, English, and preserved legacy fields; ties use `created_at DESC, id DESC`. `sort=relevance` without `q` returns `RELEVANCE_QUERY_REQUIRED` (422). `%`, `_`, and `\` are escaped and therefore searched literally. This is not linguistic stemming or fuzzy search.

Filters are `q`, controlled `category`, structured Venue `city`, minimum `capacity`, comma-separated controlled `amenities`, `bookingMode`, `pricingMode`, `minimumPriceMinor`, `maximumPriceMinor`, `from`, `to`, and `sessionCode`. Amenity matching uses AND semantics. Unknown category and amenity slugs are rejected with `SPACE_CATEGORY_INVALID` and `SPACE_AMENITY_INVALID`. Capacity means the positive-integer maximum supported attendance in `spaces.capacity_total`; wedding male/female section values remain detail fields and are not summed for this filter.

Output is Arabic-first, then English, then preserved legacy text. Location uses Venue city/district; `legacyLocation` is display fallback only. Cover media is limited to approved media. Publication, moderation, tenant, contacts, audit, and storage internals are excluded.

## Pricing and availability

Pricing includes `startingPriceMinor` as a canonical decimal string or null, `currency: SAR`, active supported modes, and VAT inclusion only when all active public prices agree. Price filters are canonical unsigned decimal strings (`0` or a non-zero digit followed by digits), compared exactly as PostgreSQL signed 64-bit integers, with a maximum of `9223372036854775807`. Decimals, signs, exponent notation, leading zeroes, whitespace, overflow, and reversed ranges are rejected. Custom-quote-only pricing has no numeric starting price. Inactive or archived rate plans are excluded.

`from` and `to` must both be explicit-offset ISO instants and span at most 31 days. Each candidate batch loads policies, hours, sessions, exceptions, and inventory blocks in five batched queries, never per Space or slot. It reuses the Sprint 3 slot rules for Venue timezone, closures, confirmed inventory, active holds, external reservations, buffers, notice, advance horizon, and named sessions. Only Spaces with an available candidate are returned. Pending requests and inquiries never create inventory blocks. Response metadata reports the actual batch and candidate work.

## Visibility and errors

Only published, non-deleted Spaces at non-deleted Venues owned by approved, non-deleted Companies are returned. A mapped legacy Space additionally requires its compatibility availability flag. Draft, pending-review, changes-requested, suspended, archived, and deleted Spaces are excluded. `instant_book` remains protected by the existing database platform-approval constraint.

Invalid field shapes/enums return `VALIDATION_ERROR` (422). Stable domain errors include `SPACE_CATEGORY_INVALID`, `SPACE_AMENITY_INVALID`, `PRICE_RANGE_INVALID`, `PRICE_FILTER_OUT_OF_RANGE`, `RELEVANCE_QUERY_REQUIRED`, `SPACE_DISCOVERY_WORK_LIMIT`, `AVAILABILITY_RANGE_INVALID`, and `AVAILABILITY_RANGE_LIMIT`.

## Representative PostgreSQL plans

On the isolated test database, representative forced-index EXPLAIN checks selected `spaces_public_discovery_index` for published newest ordering, `venues_public_city_index` for `lower(city)` equality, and `rate_plans_public_discovery_index` as an index-only scan for active public price aggregation. These match the endpoint predicates; all three indexes are retained. Relevance is a bounded PostgreSQL CASE rank over the already-filtered candidate rows and deliberately has no text-search index because the current behavior is escaped substring search, not full-text search.
