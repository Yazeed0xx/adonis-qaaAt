# User App API Handoff

This document is for the frontend team or agent responsible for the user-facing app.

It describes the current backend contract implemented in the codebase as of `2026-05-20`, with extra attention to response envelopes and fields that commonly break clients after a backend response-shape change.

## Scope

The user app owns:

- user registration and login
- email verification flow
- public hall browsing
- hall availability checks
- booking creation and booking history
- user notifications

Base URL:

- local: `http://localhost:3333`
- API root: `http://localhost:3333/api`

Auth header for protected routes:

```http
Authorization: Bearer <token>
```

## Response Contract Summary

The app should not assume every successful endpoint returns the same top-level shape.

Current success patterns:

1. Mutation with payload

```json
{
  "message": "Some success message",
  "data": {}
}
```

2. Mutation without payload

```json
{
  "message": "Some success message"
}
```

3. Single resource or resource detail

```json
{
  "data": {}
}
```

4. Paginated list

```json
{
  "data": [],
  "meta": {}
}
```

## Error Contract Summary

Validation, auth, and domain errors use a top-level `error` object.

Validation error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "The email field must be a valid email address",
        "rule": "email"
      }
    ]
  }
}
```

Domain/auth error:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid credentials"
  }
}
```

Do not parse legacy shapes like:

- `errors: [...]`
- `message` alone for failures

For failures, the frontend should read:

- `error.code`
- `error.message`
- `error.details` when present

## Key Migration Notes

These are the most likely places an older frontend integration will fail:

1. Auth responses now place the actual payload under `data`.
2. Error responses use `error`, not `errors`.
3. List endpoints return `{ data: [], meta: {} }`.
4. Detail endpoints return `{ data: {...} }`.
5. Booking and hall money fields are returned as numbers already normalized for the client:
   - `pricing`
   - `totalPrice`
6. User auth uses `emailVerified`, while nested transformed user resources use `isEmailVerified`.

## Endpoint Reference

### POST `/api/users/register`

Creates a user account and immediately returns an access token.

Request body:

```json
{
  "userName": "Mohammed Ahmed",
  "email": "mohammed@example.com",
  "password": "password123",
  "firstName": "Mohammed",
  "lastName": "Ahmed",
  "phone": "+966501234567",
  "address": "Riyadh"
}
```

Rules:

- `userName`: required, min length 2
- `email`: required, unique, valid email
- `password`: required, min length 8
- profile fields are optional

Success `201`:

```json
{
  "message": "User registered successfully. Please check your email for your verification code.",
  "data": {
    "user": {
      "id": 1,
      "userName": "Mohammed Ahmed",
      "email": "mohammed@example.com",
      "userType": "user",
      "emailVerified": false
    },
    "token": {
      "type": "bearer",
      "token": "..."
    }
  }
}
```

Frontend notes:

- token path is `data.token.token`
- user path is `data.user`
- registration does not mean email is verified
- the backend sends a 6-digit verification code by email

### POST `/api/users/login`

Request body:

```json
{
  "email": "mohammed@example.com",
  "password": "password123"
}
```

Success `200`:

```json
{
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "userName": "Mohammed Ahmed",
      "email": "mohammed@example.com",
      "userType": "user",
      "emailVerified": true
    },
    "token": {
      "type": "bearer",
      "token": "..."
    }
  }
}
```

Failure example:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid credentials"
  }
}
```

### GET `/api/users/me`

Protected.

Success `200`:

```json
{
  "data": {
    "user": {
      "id": 1,
      "userName": "Mohammed Ahmed",
      "email": "mohammed@example.com",
      "userType": "user",
      "emailVerified": true,
      "profile": {
        "id": 1,
        "firstName": "Mohammed",
        "lastName": "Ahmed",
        "phone": "+966501234567",
        "address": "Riyadh",
        "avatar": null
      }
    }
  }
}
```

Frontend notes:

- `profile` may be `null`
- this endpoint uses `profile`, not `userProfile`

### POST `/api/users/logout`

Protected.

Success `200`:

```json
{
  "message": "Logged out successfully"
}
```

### POST `/api/users/verify-email`

This endpoint completes the OTP-based email verification flow.

Request body:

```json
{
  "email": "mohammed@example.com",
  "code": "123456"
}
```

Rules:

- `email`: required, valid email
- `code`: required, exactly 6 digits

Success `200`:

```json
{
  "message": "Email verified successfully",
  "data": {
    "user": {
      "id": 1,
      "email": "mohammed@example.com",
      "emailVerified": true
    }
  }
}
```

Failure example:

```json
{
  "error": {
    "code": "INVALID_VERIFICATION_CODE",
    "message": "Invalid verification code"
  }
}
```

Failure example:

```json
{
  "error": {
    "code": "EXPIRED_VERIFICATION_CODE",
    "message": "Verification code has expired"
  }
}
```

### POST `/api/users/resend-verification`

Request body:

```json
{
  "email": "mohammed@example.com"
}
```

Success `200`:

```json
{
  "message": "If an account with that email exists and is not verified, a verification code has been sent."
}
```

Frontend note:

- this endpoint intentionally does not reveal whether the email exists
- use it for the OTP screen's "resend code" action

## Public Hall APIs

### GET `/api/halls`

Public endpoint with optional query params:

- `page`
- `limit`
- `city`
- `min_capacity`
- `max_price`
- `search`

Success `200`:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Royal Grand Hall",
      "description": "Large luxury event hall",
      "capacity": 500,
      "location": "Al Olaya District",
      "amenities": {
        "parking": true,
        "wifi": true
      },
      "images": ["https://example.com/hall.jpg"],
      "address": "123 King Fahd Road",
      "city": "Riyadh",
      "services": ["coffee", "parking"],
      "isAvailable": true,
      "createdAt": "2026-05-20T10:00:00.000+00:00",
      "updatedAt": "2026-05-20T10:00:00.000+00:00",
      "pricing": 5000,
      "company": {
        "id": 1,
        "city": "Riyadh",
        "status": "approved",
        "createdAt": "2026-05-20T10:00:00.000+00:00",
        "updatedAt": "2026-05-20T10:00:00.000+00:00",
        "companyProfile": {
          "id": 1,
          "companyName": "Royal Events Co.",
          "description": "Premium event organizers",
          "logo": null,
          "banner": null,
          "website": null,
          "socialLinks": null
        }
      }
    }
  ],
  "meta": {
    "total": 1,
    "perPage": 20,
    "currentPage": 1,
    "lastPage": 1,
    "firstPage": 1,
    "firstPageUrl": "/?page=1",
    "lastPageUrl": "/?page=1",
    "nextPageUrl": null,
    "previousPageUrl": null
  }
}
```

Frontend notes:

- filter names are snake_case in the query string: `min_capacity`, `max_price`
- response keys remain camelCase
- `pricing` is a number

### GET `/api/halls/:id`

Success `200` returns `{ data: hall }` with the same hall resource shape as the list endpoint.

### GET `/api/halls/:id/availability?date=YYYY-MM-DD`

Success `200`:

```json
{
  "data": {
    "hallId": 1,
    "hallName": "Royal Grand Hall",
    "date": "2026-05-20",
    "slots": [
      {
        "startTime": "08:00",
        "endTime": "09:00",
        "isAvailable": true
      }
    ]
  }
}
```

Frontend notes:

- `date` is required
- date must not be in the past

### GET `/api/halls/cities`

Success `200`:

```json
{
  "data": {
    "cities": ["Jeddah", "Riyadh"]
  }
}
```

## User Booking APIs

All booking routes require a logged-in user.

Creating a booking also requires a verified email address.

### POST `/api/users/bookings`

Request body:

```json
{
  "hallId": 1,
  "bookingDate": "2026-05-20",
  "startTime": "18:00",
  "endTime": "22:00",
  "serviceIds": [1, 2],
  "specialRequests": "Please add extra chairs"
}
```

Rules:

- `hallId`: positive number
- `bookingDate`: `YYYY-MM-DD`
- `startTime`: `HH:MM`
- `endTime`: `HH:MM`
- `serviceIds`: optional numeric array
- `specialRequests`: optional, max 1000 chars

Success `201`:

```json
{
  "message": "Booking request submitted successfully. The company has 7 days to respond.",
  "data": {
    "id": 10,
    "bookingDate": "2026-05-20",
    "startTime": "18:00",
    "endTime": "22:00",
    "status": "pending",
    "specialRequests": "Please add extra chairs",
    "rejectionReason": null,
    "companyRespondedAt": null,
    "expiresAt": "2026-05-27T18:00:00.000+00:00",
    "paymentStatus": "unpaid",
    "paymentDueDate": null,
    "createdAt": "2026-05-20T10:00:00.000+00:00",
    "updatedAt": "2026-05-20T10:00:00.000+00:00",
    "totalPrice": 25000,
    "isExpired": false,
    "hall": {
      "id": 1,
      "name": "Royal Grand Hall",
      "pricing": 5000
    },
    "services": [
      {
        "id": 1,
        "name": "Coffee",
        "description": "Coffee service",
        "isActive": true,
        "createdAt": "2026-05-20T10:00:00.000+00:00",
        "updatedAt": "2026-05-20T10:00:00.000+00:00",
        "price": 500
      }
    ]
  }
}
```

Frontend notes:

- the payload is the booking object itself under `data`
- `hall` is included
- `services` is included
- `user` is not included in this user-side create flow

### GET `/api/users/bookings`

Optional query params:

- `page`
- `limit`
- `status`

Success `200`:

- shape is `{ data: Booking[], meta: PaginationMeta }`
- each booking item follows the booking resource shape above

### GET `/api/users/bookings/:id`

Success `200`:

- shape is `{ data: Booking }`

### POST `/api/users/bookings/:id/cancel`

Success `200`:

```json
{
  "message": "Booking cancelled successfully",
  "data": {
    "id": 10,
    "status": "cancelled"
  }
}
```

## User Notification APIs

All notification routes require a logged-in user.

### GET `/api/users/notifications`

Optional query params:

- `page`
- `limit`
- `unread_only`

Success `200`:

```json
{
  "data": [
    {
      "id": 1,
      "type": "booking_accepted",
      "title": "Booking accepted",
      "message": "Your booking was accepted.",
      "data": {
        "bookingId": 10
      },
      "readAt": null,
      "createdAt": "2026-05-20T10:00:00.000+00:00",
      "isRead": false
    }
  ],
  "meta": {
    "total": 1,
    "perPage": 20,
    "currentPage": 1,
    "lastPage": 1,
    "firstPage": 1,
    "firstPageUrl": "/?page=1",
    "lastPageUrl": "/?page=1",
    "nextPageUrl": null,
    "previousPageUrl": null
  }
}
```

Frontend notes:

- query param is `unread_only`, not `unreadOnly`
- each notification has both `readAt` and derived `isRead`

### GET `/api/users/notifications/unread-count`

Success `200`:

```json
{
  "data": {
    "unreadCount": 2
  }
}
```

### POST `/api/users/notifications/:id/read`

Success `200`:

```json
{
  "message": "Notification marked as read",
  "data": {
    "id": 1,
    "type": "booking_accepted",
    "title": "Booking accepted",
    "message": "Your booking was accepted.",
    "data": {
      "bookingId": 10
    },
    "readAt": "2026-05-20T11:00:00.000+00:00",
    "createdAt": "2026-05-20T10:00:00.000+00:00",
    "isRead": true
  }
}
```

### POST `/api/users/notifications/read-all`

Success `200`:

```json
{
  "message": "All notifications marked as read",
  "data": {
    "markedCount": 2
  }
}
```

## Recommended Frontend Normalization

The frontend agent should normalize responses like this:

1. If `response.error` exists, treat it as failure.
2. If `response.data` exists, use it as the payload.
3. If `response.meta` exists, treat it as pagination metadata for `response.data`.
4. Read success notifications from `response.message` when needed for UI toasts.

Example helper shape:

```ts
type ApiSuccess<T> =
  | { data: T; message?: string; meta?: Record<string, unknown> }
  | { message: string }

type ApiFailure = {
  error: {
    code: string
    message: string
    details?: Array<{
      field?: string
      message: string
      rule?: string
    }>
  }
}
```

## Final Notes For The User App Agent

When reorganizing API calls, assume these contracts are authoritative over older duplicate docs elsewhere in `docs/`.

The safest update order is:

1. fix global error parsing to use `error`
2. fix auth parsing to read `data.user` and `data.token`
3. fix list views to read `data` plus `meta`
4. fix detail views to read `data`
5. keep endpoint-specific query names exactly as implemented
