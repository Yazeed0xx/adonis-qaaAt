# QaaAt User App — API Integration Guide

> Base URL: `http://localhost:3333` (development) or your production domain.
> All endpoints return JSON. Send `Content-Type: application/json` for all requests (except file uploads).

---

## Authentication

All protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

The token is obtained from the `/register` or `/login` response.

---

## Error Format

All errors follow this shape:

```json
{
  "message": "Human-readable error message"
}
```

Validation errors (422) return:

```json
{
  "errors": [
    {
      "message": "The email field must be a valid email address",
      "rule": "email",
      "field": "email"
    }
  ]
}
```

---

## Pagination Format

All paginated endpoints return:

```json
{
  "meta": {
    "total": 50,
    "perPage": 20,
    "currentPage": 1,
    "lastPage": 3,
    "firstPage": 1
  },
  "data": [ ... ]
}
```

Use `?page=1&limit=20` query params to control pagination. Max limit is 100.

---

## 1. Authentication

### POST `/api/users/register`

Register a new user account. No auth required.

**Request Body:**

| Field       | Type   | Required | Notes                       |
|-------------|--------|----------|-----------------------------|
| email       | string | Yes      | Must be unique, valid email |
| password    | string | Yes      | Min 8 characters            |
| userName    | string | No       | Display name                |
| firstName   | string | No       | Stored in user profile      |
| lastName    | string | No       | Stored in user profile      |
| phone       | string | No       | Stored in user profile      |
| address     | string | No       | Stored in user profile      |

**Example Request:**

```json
{
  "email": "user@example.com",
  "password": "mypassword123",
  "userName": "Ahmed",
  "firstName": "Ahmed",
  "lastName": "Ali",
  "phone": "+966501234567"
}
```

**Success Response (201):**

```json
{
  "message": "User registered successfully. Please check your email to verify your account.",
  "user": {
    "id": 1,
    "userName": "Ahmed",
    "email": "user@example.com",
    "userType": "user",
    "emailVerified": false
  },
  "token": {
    "type": "bearer",
    "token": "oat_NTY..."
  }
}
```

**Notes:**
- A verification email is sent automatically after registration.
- The user can start using the app immediately but cannot create bookings until email is verified.
- Store the token securely for subsequent authenticated requests.

---

### POST `/api/users/login`

Login with existing credentials. No auth required.

**Request Body:**

| Field    | Type   | Required |
|----------|--------|----------|
| email    | string | Yes      |
| password | string | Yes      |

**Example Request:**

```json
{
  "email": "user@example.com",
  "password": "mypassword123"
}
```

**Success Response (200):**

```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "userName": "Ahmed",
    "email": "user@example.com",
    "userType": "user",
    "emailVerified": true
  },
  "token": {
    "type": "bearer",
    "token": "oat_NTY..."
  }
}
```

**Error Response (401):**

```json
{
  "message": "Invalid credentials"
}
```

---

### GET `/api/users/me`

Get the authenticated user's profile. **Auth required.**

**Success Response (200):**

```json
{
  "user": {
    "id": 1,
    "userName": "Ahmed",
    "email": "user@example.com",
    "userType": "user",
    "emailVerified": true,
    "profile": {
      "id": 1,
      "firstName": "Ahmed",
      "lastName": "Ali",
      "phone": "+966501234567",
      "address": "Riyadh, Saudi Arabia",
      "avatar": null,
      "userId": 1,
      "createdAt": "2026-02-20T10:00:00.000+00:00",
      "updatedAt": "2026-02-20T10:00:00.000+00:00"
    }
  }
}
```

**Notes:**
- `profile` will be `null` if no profile data was provided during registration.

---

### POST `/api/users/logout`

Revoke the current access token. **Auth required.**

**Success Response (200):**

```json
{
  "message": "Logged out successfully"
}
```

---

## 2. Email Verification

### GET `/api/users/verify-email/:token`

Verify a user's email address using the token from the verification email. No auth required.

**URL Params:**

| Param | Type   | Description                          |
|-------|--------|--------------------------------------|
| token | string | Verification token from email link   |

**Success Response (200):**

```json
{
  "message": "Email verified successfully",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "emailVerified": true
  }
}
```

**Error Response (400):**

```json
{
  "message": "Invalid or expired verification token"
}
```

---

### POST `/api/users/resend-verification`

Resend the verification email. No auth required.

**Request Body:**

| Field | Type   | Required |
|-------|--------|----------|
| email | string | Yes      |

**Example Request:**

```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**

```json
{
  "message": "If an account with that email exists and is not verified, a verification email has been sent."
}
```

**Notes:**
- The response message is intentionally vague to prevent email enumeration.

---

## 3. Browse Halls (Public)

These endpoints require **no authentication**.

### GET `/api/halls`

Browse all available halls with optional filters.

**Query Parameters:**

| Param        | Type   | Default | Description                        |
|--------------|--------|---------|------------------------------------|
| page         | number | 1       | Page number                        |
| limit        | number | 20      | Results per page (max 100)         |
| city         | string | —       | Filter by exact city name          |
| min_capacity | number | —       | Minimum hall capacity              |
| max_price    | number | —       | Maximum price per hour             |
| search       | string | —       | Search in name, description, location |

**Example:** `GET /api/halls?city=Riyadh&min_capacity=100&max_price=500&page=1&limit=10`

**Success Response (200):**

```json
{
  "meta": {
    "total": 15,
    "perPage": 10,
    "currentPage": 1,
    "lastPage": 2,
    "firstPage": 1
  },
  "data": [
    {
      "id": 1,
      "name": "Grand Ballroom",
      "description": "A luxurious ballroom for weddings and events",
      "capacity": 500,
      "location": "King Fahd Road",
      "amenities": { "wifi": true, "parking": true, "stage": true },
      "pricing": 300,
      "images": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
      "address": "123 King Fahd Road",
      "city": "Riyadh",
      "services": ["Photography", "Catering", "Decoration"],
      "isAvailable": true,
      "companyId": 1,
      "createdAt": "2026-02-15T10:00:00.000+00:00",
      "updatedAt": "2026-02-15T10:00:00.000+00:00",
      "company": {
        "id": 1,
        "userId": 2,
        "status": "approved",
        "companyProfile": {
          "id": 1,
          "companyName": "Royal Events Co.",
          "description": "Premium event hall provider",
          "logo": "https://example.com/logo.png",
          "banner": null,
          "website": "https://royalevents.sa",
          "socialLinks": { "twitter": "@royalevents" }
        }
      }
    }
  ]
}
```

**Notes:**
- Only halls from **approved** companies with `isAvailable: true` are returned.
- `amenities` is a flexible JSON object — keys vary per hall.
- `images` is an array of URL strings (may be `null`).
- `services` is an array of service name strings (may be `null`).
- `pricing` is the price **per hour** in the hall's currency.

---

### GET `/api/halls/:id`

Get a single hall's full details. No auth required.

**URL Params:**

| Param | Type   |
|-------|--------|
| id    | number |

**Success Response (200):** Same shape as a single item from the list above.

**Error Response (404):**

```json
{
  "message": "Hall not found or not available"
}
```

---

### GET `/api/halls/:id/availability`

Check available time slots for a hall on a specific date. No auth required.

**URL Params:**

| Param | Type   |
|-------|--------|
| id    | number |

**Query Parameters:**

| Param | Type   | Required | Format     |
|-------|--------|----------|------------|
| date  | string | Yes      | YYYY-MM-DD |

**Example:** `GET /api/halls/1/availability?date=2026-03-15`

**Success Response (200):**

```json
{
  "hallId": 1,
  "hallName": "Grand Ballroom",
  "date": "2026-03-15",
  "slots": [
    { "startTime": "08:00", "endTime": "10:00", "isAvailable": true },
    { "startTime": "10:00", "endTime": "12:00", "isAvailable": false },
    { "startTime": "12:00", "endTime": "14:00", "isAvailable": true },
    { "startTime": "14:00", "endTime": "16:00", "isAvailable": true },
    { "startTime": "16:00", "endTime": "18:00", "isAvailable": true },
    { "startTime": "18:00", "endTime": "20:00", "isAvailable": false },
    { "startTime": "20:00", "endTime": "22:00", "isAvailable": true }
  ]
}
```

**Error Responses:**
- `400` — Missing or invalid date, or date is in the past.
- `404` — Hall not found.

**Notes:**
- Slots are 2-hour blocks from 08:00 to 22:00.
- `isAvailable: false` means that slot already has a pending/accepted/confirmed booking.
- Users can book **custom time ranges** (not limited to these slots) — the slots are just a guide.

---

### GET `/api/halls/cities`

Get a list of all cities that have available halls. No auth required.

**Success Response (200):**

```json
{
  "cities": ["Dammam", "Jeddah", "Riyadh"]
}
```

---

## 4. Bookings

### GET `/api/users/bookings`

List the authenticated user's bookings. **Auth required.**

**Query Parameters:**

| Param  | Type   | Default | Description                                    |
|--------|--------|---------|------------------------------------------------|
| page   | number | 1       | Page number                                    |
| limit  | number | 20      | Results per page (max 100)                     |
| status | string | —       | Filter: `pending`, `accepted`, `rejected`, `confirmed`, `cancelled`, `completed`, `expired` |

**Example:** `GET /api/users/bookings?status=pending&page=1`

**Success Response (200):** Paginated list of bookings.

```json
{
  "meta": { "total": 3, "perPage": 20, "currentPage": 1, "lastPage": 1, "firstPage": 1 },
  "data": [
    {
      "id": 1,
      "bookingDate": "2026-03-15",
      "startTime": "14:00:00",
      "endTime": "18:00:00",
      "status": "pending",
      "totalPrice": 1200,
      "specialRequests": "Need extra chairs",
      "rejectionReason": null,
      "companyRespondedAt": null,
      "expiresAt": "2026-02-27T10:00:00.000+00:00",
      "paymentStatus": "unpaid",
      "paymentDueDate": null,
      "userId": 1,
      "hallId": 1,
      "createdAt": "2026-02-20T10:00:00.000+00:00",
      "updatedAt": "2026-02-20T10:00:00.000+00:00",
      "hall": {
        "id": 1,
        "name": "Grand Ballroom",
        "pricing": 300,
        "city": "Riyadh",
        "address": "123 King Fahd Road",
        "company": {
          "id": 1,
          "companyProfile": {
            "companyName": "Royal Events Co.",
            "logo": "https://example.com/logo.png"
          }
        }
      },
      "services": [
        {
          "id": 1,
          "name": "Photography",
          "description": "Professional event photography",
          "price": 500,
          "__pivot_price_at_booking": 500,
          "__pivot_booking_id": 1,
          "__pivot_service_id": 1
        }
      ]
    }
  ]
}
```

---

### POST `/api/users/bookings`

Create a new booking request. **Auth required + Email must be verified.**

**Request Body:**

| Field           | Type     | Required | Notes                              |
|-----------------|----------|----------|------------------------------------|
| hallId          | number   | Yes      | ID of the hall to book             |
| bookingDate     | string   | Yes      | Format: `YYYY-MM-DD`, must be today or future |
| startTime       | string   | Yes      | Format: `HH:MM` (24h), e.g. `"14:00"` |
| endTime         | string   | Yes      | Format: `HH:MM` (24h), must be after startTime |
| serviceIds      | number[] | No       | Array of service IDs to add        |
| specialRequests | string   | No       | Max 1000 characters                |

**Example Request:**

```json
{
  "hallId": 1,
  "bookingDate": "2026-03-15",
  "startTime": "14:00",
  "endTime": "18:00",
  "serviceIds": [1, 3],
  "specialRequests": "Need extra chairs please"
}
```

**Success Response (201):**

```json
{
  "message": "Booking request submitted successfully. The company has 7 days to respond.",
  "booking": {
    "id": 1,
    "bookingDate": "2026-03-15",
    "startTime": "14:00:00",
    "endTime": "18:00:00",
    "status": "pending",
    "totalPrice": 1700,
    "specialRequests": "Need extra chairs please",
    "paymentStatus": "unpaid",
    "expiresAt": "2026-02-27T10:00:00.000+00:00",
    "userId": 1,
    "hallId": 1,
    "hall": { "..." },
    "services": [ "..." ]
  }
}
```

**Error Responses (400):**

```json
{ "message": "Booking date must be today or in the future" }
{ "message": "End time must be after start time" }
{ "message": "Hall not found" }
{ "message": "Hall is not available for booking" }
{ "message": "The selected time slot is not available" }
{ "message": "One or more selected services are not available for this hall" }
```

**Error Response (403) — email not verified:**

```json
{
  "message": "Please verify your email address before proceeding.",
  "code": "EMAIL_NOT_VERIFIED"
}
```

**Notes:**
- `totalPrice` is calculated automatically: `(hours * hall.pricing) + sum(service prices)`.
- The booking starts as `"pending"` — the company has 7 days to accept/reject.
- `expiresAt` is set to 7 days from creation. If the company doesn't respond, it expires.

---

### GET `/api/users/bookings/:id`

Get a single booking's details. **Auth required.** Users can only see their own bookings.

**URL Params:**

| Param | Type   |
|-------|--------|
| id    | number |

**Success Response (200):** Same shape as a single booking from the list endpoint.

**Error Response (404):**

```json
{
  "message": "Booking not found"
}
```

---

### POST `/api/users/bookings/:id/cancel`

Cancel a booking. **Auth required.** Only bookings with status `pending` or `accepted` can be cancelled.

**URL Params:**

| Param | Type   |
|-------|--------|
| id    | number |

**No request body needed.**

**Success Response (200):**

```json
{
  "message": "Booking cancelled successfully",
  "booking": {
    "id": 1,
    "status": "cancelled"
  }
}
```

**Error Responses (400):**

```json
{ "message": "Booking not found" }
{ "message": "Cannot cancel booking with status: confirmed" }
```

---

## 5. Notifications

### GET `/api/users/notifications`

Get the user's notifications. **Auth required.**

**Query Parameters:**

| Param       | Type    | Default | Description             |
|-------------|---------|---------|-------------------------|
| page        | number  | 1       | Page number             |
| limit       | number  | 20      | Results per page        |
| unread_only | string  | false   | Set to `"true"` to filter |

**Success Response (200):** Paginated list.

```json
{
  "meta": { "total": 5, "perPage": 20, "currentPage": 1, "lastPage": 1, "firstPage": 1 },
  "data": [
    {
      "id": 1,
      "userId": 1,
      "type": "booking_accepted",
      "title": "Booking Confirmed",
      "message": "Great news! Your booking for \"Grand Ballroom\" on 2026-03-15 has been accepted.",
      "data": {
        "bookingId": 1,
        "hallName": "Grand Ballroom",
        "bookingDate": "2026-03-15"
      },
      "readAt": null,
      "createdAt": "2026-02-21T10:00:00.000+00:00"
    }
  ]
}
```

**Notification Types (for `type` field):**

| Type               | When it's sent                                |
|--------------------|-----------------------------------------------|
| `email_verified`   | User's email was verified                     |
| `booking_accepted` | Company accepted the user's booking           |
| `booking_rejected` | Company rejected the user's booking           |
| `booking_cancelled`| Booking was cancelled                         |
| `booking_expired`  | Booking expired (company didn't respond in 7 days) |

**Notes:**
- `readAt` is `null` for unread notifications, a datetime string when read.
- `data` contains context like `bookingId`, `hallName`, `bookingDate`, `reason` (for rejections).

---

### GET `/api/users/notifications/unread-count`

Get the count of unread notifications. **Auth required.** Use this for badge indicators.

**Success Response (200):**

```json
{
  "unreadCount": 3
}
```

---

### POST `/api/users/notifications/:id/read`

Mark a single notification as read. **Auth required.**

**URL Params:**

| Param | Type   |
|-------|--------|
| id    | number |

**No request body needed.**

**Success Response (200):**

```json
{
  "message": "Notification marked as read",
  "notification": {
    "id": 1,
    "type": "booking_accepted",
    "title": "Booking Confirmed",
    "readAt": "2026-02-21T12:00:00.000+00:00",
    "..."
  }
}
```

**Error Response (404):**

```json
{
  "message": "Notification not found"
}
```

---

### POST `/api/users/notifications/read-all`

Mark all notifications as read. **Auth required.**

**No request body needed.**

**Success Response (200):**

```json
{
  "message": "All notifications marked as read",
  "markedCount": 5
}
```

---

## 6. Booking Flow Summary

This is the lifecycle of a booking from the user's perspective:

```
User creates booking
       │
       ▼
   ┌─────────┐
   │ pending  │ ← Waiting for company response (7-day window)
   └────┬─────┘
        │
   ┌────┴──────────────┬──────────────┐
   ▼                   ▼              ▼
┌──────────┐    ┌────────────┐  ┌──────────┐
│ accepted │    │  rejected  │  │ expired  │
│          │    │            │  │ (auto)   │
└────┬─────┘    └────────────┘  └──────────┘
     │
     ▼
┌───────────┐
│ confirmed │ ← After payment
└───────────┘
```

- **pending** → Company has 7 days to respond.
- **accepted** → Company accepted. User should pay within 3 days (`paymentDueDate`).
- **rejected** → Company rejected with a reason (`rejectionReason`).
- **expired** → Company didn't respond within 7 days.
- **confirmed** → Payment completed.
- **cancelled** → User cancelled (only from `pending` or `accepted`).
- **completed** → Event date passed.

---

## 7. HTTP Status Codes Reference

| Code | Meaning                                                    |
|------|------------------------------------------------------------|
| 200  | Success                                                    |
| 201  | Created (registration, booking creation)                   |
| 400  | Bad request (validation error, business logic error)       |
| 401  | Unauthorized (missing/invalid token, wrong credentials)    |
| 403  | Forbidden (email not verified, wrong user type)            |
| 404  | Not found                                                  |
| 422  | Validation error (field-level errors from VineJS)          |
| 500  | Server error                                               |

---

## 8. Key Implementation Notes for Frontend

1. **Token Storage:** Store the Bearer token securely (e.g., `SecureStore` in React Native). Send it in every authenticated request header.

2. **Email Verification Gate:** After registration, the user can browse and view bookings, but **cannot create bookings** until email is verified. Check `user.emailVerified` from `/me` or login response to show a verification banner.

3. **Notification Polling:** Use `GET /api/users/notifications/unread-count` to poll for new notifications (e.g., every 30-60 seconds) and show a badge on the notifications icon.

4. **Booking Status Colors:** Suggested color mapping:
   - `pending` → Yellow/Orange
   - `accepted` → Blue
   - `confirmed` → Green
   - `rejected` → Red
   - `expired` → Gray
   - `cancelled` → Gray
   - `completed` → Green (dimmed)

5. **City Filter:** Use `GET /api/halls/cities` to populate the city dropdown filter on the halls browse screen.

6. **Availability Calendar:** Use `GET /api/halls/:id/availability?date=YYYY-MM-DD` to show available time slots when the user selects a date on the booking form.

7. **Price Display:** `pricing` on halls is **per hour**. The server calculates the final `totalPrice` when creating a booking, so you don't need to calculate it client-side (but you can show an estimate).

8. **Pagination:** All list endpoints use cursor-based pagination. Always check `meta.lastPage` to know when to stop loading more data.
