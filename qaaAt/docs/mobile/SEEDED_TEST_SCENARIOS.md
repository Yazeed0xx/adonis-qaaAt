# Seeded Mobile Acceptance Scenarios

This is the shared local test contract for the customer and company mobile apps. The default seed is intentionally small, deterministic, and built through the same domain services used by the API.

> `node ace migration:fresh --seed` destroys the configured database. Run it only against a disposable local database.

## Create the dataset

```bash
node ace migration:fresh --seed
```

The only supported seed profile is `mobile`. It contains a small deterministic acceptance dataset. An unsupported `SEED_PROFILE` fails instead of silently producing a different dataset.

## Login accounts

All mobile acceptance accounts use the password `password123`.

| App      | Account           | Email                         | Purpose                                                      |
| -------- | ----------------- | ----------------------------- | ------------------------------------------------------------ |
| Customer | Verified customer | `mohammed@example.com`        | Discovery, requests, inquiries, visits, quotes, and payments |
| Company  | Owner             | `royal@example.com`           | Full company permissions                                     |
| Company  | Manager           | `mobile.manager@qaat.test`    | All permissions except payout settings                       |
| Company  | Booking staff     | `mobile.booking@qaat.test`    | Requests, inquiries, quotes, pricing, visits, and bookings   |
| Company  | Calendar staff    | `mobile.calendar@qaat.test`   | Calendar management and read-oriented request access         |
| Company  | Accountant        | `mobile.accountant@qaat.test` | Finance, pricing, booking, and refund-request access         |

Additional existing accounts:

| State               | Email                | Password      |
| ------------------- | -------------------- | ------------- |
| Admin               | `admin@qaat.app`     | `admin123`    |
| Unverified customer | `fatima@example.com` | `password123` |
| Pending company     | `star@example.com`   | `password123` |
| Rejected company    | `quick@example.com`  | `password123` |

The Royal Events accounts all select the same approved company. Company login returns the active membership, role, and resolved permissions; mobile code must use those returned permissions rather than hard-coded role assumptions.

## Published discovery inventory

The seed creates one verified Riyadh Venue named **Royal Business and Events Center** with two published Spaces:

| Space                   | Booking mode      | Pricing                                    | Intended journey                                                       |
| ----------------------- | ----------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| Royal Meeting Room      | `request_to_book` | SAR 100/hour plus VAT                      | Search → availability → booking request → company decision → payment   |
| Royal Celebration Space | `quote_required`  | Quote catalog with event rate and catering | Search → inquiry/visit → quote → customer acceptance → deposit payment |

Both Spaces have:

- Seven days of operating hours, from 08:00 to 23:00 in `Asia/Riyadh`.
- Active availability and response policies.
- Approved controlled-storage cover media served by the authenticated/public media endpoints.
- Relative future dates, recalculated whenever the database is seeded so the workflows do not expire because of a hard-coded calendar date.

## Stable scenario references

Database IDs are printed by the seeder and may change if seed order changes. Use these stable business references when locating scenarios:

| Reference            | State                                     | Actor expected to act next                                |
| -------------------- | ----------------------------------------- | --------------------------------------------------------- |
| `MOB-BR-PENDING`     | Booking `pending`                         | Company owner, manager, or booking staff approves/rejects |
| `MOB-BR-PAYMENT`     | Booking `accepted`, active payment hold   | Customer initiates payment                                |
| `MOB-DI-OPEN`        | Inquiry `open`                            | Company owner, manager, or booking staff answers/rejects  |
| `MOB-DI-ANSWERED`    | Inquiry `answered` with a company message | Customer reads the conversation                           |
| `MOB-DI-QUOTE`       | Inquiry attached to a sent quote          | Customer reviews the quote                                |
| `MOB-VR-SUBMITTED`   | Visit `submitted`                         | Company confirms, proposes another time, or rejects       |
| `MOB-VR-ALTERNATIVE` | Visit `alternative_proposed`              | Customer accepts or rejects the alternative               |
| `MOB-QT-SENT`        | Quote `sent`, 50% deposit                 | Customer accepts or declines before its expiry            |

The dataset also includes an active future internal event and matching inventory block for company calendar rendering, plus customer/company notifications pointing to the seeded booking and quote.

## Suggested customer-app smoke test

1. Sign in as `mohammed@example.com`.
2. Discover both published Spaces and load their controlled cover images.
3. Check Royal Meeting Room availability.
4. Inspect `MOB-BR-PAYMENT` and initiate its payment.
5. Inspect the answered inquiry and its message history.
6. Accept or reject the alternative visit.
7. Inspect and accept `MOB-QT-SENT`; verify that acceptance creates a payment-held booking.
8. Register a push installation and verify customer notification listing/read behavior.

For the local fake payment journey, configure the non-production values documented in `.env.example`:

```env
PAYMENT_DRIVER=fake
FAKE_PAYMENT_WEBHOOK_SECRET=replace-with-a-long-local-only-secret
```

The checkout URL uses the `qaaat-fake://` scheme. Payment success remains webhook-driven; the mobile client must refresh payment/booking state and must not mark a booking paid from the redirect alone.

## Suggested company-app smoke test

1. Sign in as the owner and verify the returned company, membership, and permission set.
2. Review and decide `MOB-BR-PENDING`.
3. Answer `MOB-DI-OPEN` and inspect the existing answered conversation.
4. Confirm `MOB-VR-SUBMITTED` or propose a different time.
5. Inspect the sent quote and its immutable sent revision.
6. Render operating hours, the active external reservation, booking holds, and inventory blocks in the calendar.
7. Sign in as booking staff, calendar staff, and accountant; verify that visible actions follow returned permissions.
8. Register a company-app push installation and verify company-scoped notification behavior.

## Seed integrity

The seed verifies its own contract before reporting success. It checks the promised publication modes, workflow states, active hold, quote, external reservation, company roles, approved covers, and physical private-storage files. A broken scenario fails the seed immediately.

The Japa integration contract independently runs this production seeding slice against the disposable test database with a fake Drive disk. Normal feature tests continue to use per-test factories and do not depend on this shared dataset.
