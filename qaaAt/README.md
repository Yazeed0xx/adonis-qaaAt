# QaaAt - Hall Booking Application

A hall booking application built with AdonisJS, allowing users and companies to manage hall reservations with additional services.

## Features

- **User Management**: Support for both regular users and companies
- **Profile System**: Separate profiles for users and companies
- **Hall Management**: Companies can create and manage halls
- **Booking System**: Users can book halls with date/time selection
- **Additional Services**: Companies can offer services (photographer, dinner packages, coffee & tea, etc.) that users can add to bookings
- **Authentication**: Token-based authentication system

## Database Schema

### Core Tables

- `users` - Base user authentication (supports both "user" and "company" types)
- `user_profiles` - Profile information for regular users
- `company_profiles` - Public-facing profile information for companies
- `companies` - Business/legal information for companies
- `halls` - Halls owned and managed by companies
- `bookings` - User bookings for halls
- `services` - Additional services offered by companies
- `booking_services` - Pivot table linking bookings to selected services

## Tech Stack

- **Framework**: AdonisJS 7
- **Database**: PostgreSQL
- **Authentication**: AdonisJS Auth (Access Tokens)
- **Language**: TypeScript

## Getting Started

### Prerequisites

- Node.js 24 or higher
- PostgreSQL
- ClamAV with `clamdscan` available on the application host
- npm or yarn

### Installation

1. Clone the repository

```bash
git clone <repository-url>
cd qaaAt
```

2. Install dependencies

```bash
npm install
```

3. Copy environment file

```bash
cp .env.example .env
```

4. Configure your `.env` file with database credentials

For production, keep `LIMITER_STORE=database` so authentication throttles are shared across
application instances. Set `MALWARE_SCANNER_COMMAND` to the `clamdscan` executable name or absolute
path. Company registration fails closed with HTTP 503 when the scanner is unavailable; it never
stores an unscanned registration PDF.

5. Run migrations

```bash
node ace migration:run
```

6. Start the development server

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run lint` - Lint code
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Type check without emitting
- `npm run verify:production` - Run the complete release verification gate

## Production deployment

Production requires separate supervised web and queue-worker processes using the same release and
database. Run migrations once as a controlled release step before replacing web instances.

```bash
npm ci
npm run verify:production
npm run build
cd build
npm ci --omit=dev
npm run release:migrate
npm run start:production
```

Start at least one worker from the same `build` directory:

```bash
npm run start:worker:production
```

Required production settings include `NODE_ENV=production`, `QUEUE_DRIVER=database`,
`LIMITER_STORE=database`, and `PRIVATE_STORAGE_PATH` pointing to persistent storage. Mount
`/data/private` and set `PRIVATE_STORAGE_PATH=/data/private` when using the supplied Docker image.
Do not place registration documents on an ephemeral container filesystem.

Use `/health/live` for liveness and `/health` for readiness. Readiness includes database, memory, and
disk checks. API documentation is disabled in production unless `OPENAPI_ENABLED=true` is explicitly
set.

Back up the database before migrations, deploy backward-compatible schema changes before application
changes, and retain the previous image for rollback. Monitor HTTP error rate and latency, database
pool usage, queue depth/failures, disk capacity, and readiness failures.

## Project Structure

```
qaaAt/
├── app/
│   ├── controllers/     # Request handlers
│   ├── models/          # Database models
│   ├── middleware/      # HTTP middleware
│   └── ...
├── database/
│   └── migrations/      # Database migrations
├── config/              # Configuration files
└── start/               # Application entry points
```

## Mobile Integration Docs

Canonical mobile integration docs live in:

- `docs/mobile/README.md`
- `docs/mobile/user-app.md`
- `docs/mobile/company-app.md`

Generated Outloud OpenAPI documentation is also available at runtime:

- `/docs`
- `/openapi.json`

## License

UNLICENSED
