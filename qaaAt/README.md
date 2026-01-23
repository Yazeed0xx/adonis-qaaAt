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

- **Framework**: AdonisJS 6
- **Database**: PostgreSQL
- **Authentication**: AdonisJS Auth (Access Tokens)
- **Language**: TypeScript

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL
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

## License

UNLICENSED
