# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QaaAt is a hall booking application built with AdonisJS 6, TypeScript, and PostgreSQL. It supports three user types (users, companies, admins) with authentication, hall management, and booking systems.

## Common Commands

```bash
# Development
npm run dev          # Start dev server with HMR
npm run build        # Build for production
npm start            # Start production server

# Code Quality
npm run lint         # Run ESLint
npm run format       # Format with Prettier
npm run typecheck    # Type check without emitting

# Testing
npm test             # Run all tests (unit + functional)

# Database
node ace migration:run      # Run migrations
node ace migration:rollback # Rollback migrations
node ace db:seed            # Run seeders
```

## Architecture

### Directory Structure

All application code lives in `qaaAt/`:

- `app/controllers/` - HTTP request handlers, organized by feature (auth/, admin, hall)
- `app/models/` - Lucid ORM models with relationships
- `app/services/` - Business logic (e.g., HallService for CRUD operations)
- `app/middleware/` - Auth, admin, company guards
- `app/validators/` - VineJS request validators
- `config/` - App configuration files
- `database/migrations/` - Database schema migrations
- `start/routes.ts` - All API route definitions
- `start/kernel.ts` - Middleware registration

### Authentication System

- Token-based auth using AdonisJS Access Tokens
- Three user types stored in `users.user_type`: "user", "company", "admin"
- Middleware guards: `auth()` (any authenticated), `admin()`, `company()`
- Token sent via `Authorization: Bearer {token}` header

### Key Models & Relationships

- **User** → hasOne(UserProfile), hasOne(Company), hasMany(Booking)
- **Company** → belongsTo(User), hasOne(CompanyProfile), hasMany(Hall), hasMany(Service)
- **Hall** → belongsTo(Company), hasMany(Booking)
- **Booking** → belongsTo(User), belongsTo(Hall), manyToMany(Service)

### Import Aliases

Use these path aliases defined in package.json:

```typescript
import User from '#models/user'
import HallService from '#services/hall_service'
import { authMiddleware } from '#middleware/auth_middleware'
```

Available: `#controllers/*`, `#models/*`, `#services/*`, `#validators/*`, `#middleware/*`, `#exceptions/*`, `#database/*`, `#config/*`

### API Routes Structure

Base URL: `/api`

- `/api/users/*` - User auth (register, login, me, logout)
- `/api/companies/*` - Company auth + hall management
- `/api/admin/*` - Admin auth + system management (users, companies, halls, bookings, statistics)

### Database Conventions

- Soft deletes via `deleted_at` column on most tables
- Pagination: `.paginate(page, limit)` returns paginated results
- Eager loading: `.preload('relation')` for relationships

## Environment Variables

Required in `.env`:

```
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE
APP_KEY, NODE_ENV, PORT, HOST
```

## Testing

- Unit tests: `tests/unit/**/*.spec.ts` (2s timeout)
- Functional tests: `tests/functional/**/*.spec.ts` (30s timeout)
- Uses Japa test runner with @japa/assert, @japa/api-client
