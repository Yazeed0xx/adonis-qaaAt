# QaaAt User App -- API Documentation

Base URL: `{API_BASE_URL}/api`

> All response keys are **camelCase**. Request body keys are also **camelCase**.

## Authentication

All authenticated endpoints require the header:

```
Authorization: Bearer {token}
```

Tokens are returned from `/users/register` and `/users/login`.

### Error Responses (Global)

**401 Unauthorized** (missing/invalid token on protected routes):

```json
{ "errors": [{ "message": "Unauthorized access" }] }
```

**403 Email Not Verified** (on routes requiring verified email):

```json
{ "message": "Please verify your email address before proceeding.", "code": "EMAIL_NOT_VERIFIED" }
```

**422 Validation Error** (invalid request body):

```json
{ "errors": [{ "message": "...", "rule": "...", "field": "..." }] }
```

---

## 1. Auth Endpoints

### POST `/users/register`

Register a new user account.

**Auth:** None

**Request Body:**

| Field       | Type   | Required | Rules               |
| ----------- | ------ | -------- | ------------------- |
| `email`     | string | yes      | valid email, unique |
| `password`  | string | yes      | min 8 characters    |
| `userName`  | string | no       |                     |
| `firstName` | string | no       |                     |
| `lastName`  | string | no       |                     |
| `phone`     | string | no       |                     |
| `address`   | string | no       |                     |

**Response 201:**

```json
{
  "message": "User registered successfully. Please check your email to verify your account.",
  "user": {
    "id": 1,
    "userName": "john",
    "email": "john@example.com",
    "userType": "user",
    "emailVerified": false
  },
  "token": {
    "type": "bearer",
    "token": "oat_MTA.aWQ..."
  }
}
```

---

### POST `/users/login`

**Auth:** None

**Request Body:**

| Field      | Type   | Required |
| ---------- | ------ | -------- |
| `email`    | string | yes      |
| `password` | string | yes      |

**Response 200:**

```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "userName": "john",
    "email": "john@example.com",
    "userType": "user",
    "emailVerified": true
  },
  "token": {
    "type": "bearer",
    "token": "oat_MTA.aWQ..."
  }
}
```

**Response 401:**

```json
{ "message": "Invalid credentials" }
```

---

### GET `/users/me`

Get the authenticated user's profile.

**Auth:** Bearer token

**Response 200:**

```json
{
  "user": {
    "id": 1,
    "userName": "john",
    "email": "john@example.com",
    "userType": "user",
    "emailVerified": true,
    "profile": {
      "id": 1,
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+966...",
      "address": "Riyadh",
      "avatar": null,
      "userId": 1,
      "createdAt": "2025-01-01T00:00:00.000+00:00",
      "updatedAt": "2025-01-01T00:00:00.000+00:00",
      "deletedAt": null
    }
  }
}
```

> Note: `profile` is `null` if no profile was created during registration.

---

### POST `/users/logout`

Revoke the current access token.

**Auth:** Bearer token

**Response 200:**

```json
{ "message": "Logged out successfully" }
```

---

### POST `/users/verify-email`

Verify a user's email using the OTP code sent via email.

**Auth:** None

**Request Body:**

```json
{ "email": "john@example.com", "code": "123456" }
```

**Response 200:**

```json
{
  "message": "Email verified successfully",
  "data": {
    "user": { "id": 1, "email": "john@example.com", "emailVerified": true }
  }
}
```

**Response 422:**

```json
{
  "error": {
    "code": "INVALID_VERIFICATION_CODE",
    "message": "Invalid verification code"
  }
}
```

---

### POST `/users/resend-verification`

Resend the email verification code.

**Auth:** None

**Request Body:**

```json
{ "email": "john@example.com" }
```

**Response 200:**

```json
{
  "message": "If an account with that email exists and is not verified, a verification code has been sent."
}
```

**Response 400:**

```json
{ "message": "Email address is required" }
```

---

## 2. Hall Endpoints (Public)

All hall browsing endpoints require no authentication.

### GET `/halls`

Browse all available halls with optional filters.

**Query Parameters:**

| Param          | Type   | Default | Description                           |
| -------------- | ------ | ------- | ------------------------------------- |
| `page`         | number | 1       | Page number                           |
| `limit`        | number | 20      | Items per page (max 100)              |
| `city`         | string | --      | Filter by exact city name             |
| `min_capacity` | number | --      | Minimum capacity                      |
| `max_price`    | number | --      | Maximum price per hour                |
| `search`       | string | --      | Search in name, description, location |

**Response 200:**

```json
{
  "meta": {
    "total": 50,
    "perPage": 20,
    "currentPage": 1,
    "lastPage": 3,
    "firstPage": 1,
    "firstPageUrl": "/?page=1",
    "lastPageUrl": "/?page=3",
    "nextPageUrl": "/?page=2",
    "previousPageUrl": null
  },
  "data": [
    {
      "id": 1,
      "name": "Grand Hall",
      "description": "A luxury hall...",
      "capacity": 200,
      "location": "Downtown",
      "amenities": { "wifi": true, "parking": true },
      "pricing": "500.00",
      "images": ["https://...jpg", "https://...jpg"],
      "address": "123 Main St",
      "city": "Riyadh",
      "services": ["free coffee", "free sweets", "valet parking"],
      "isAvailable": true,
      "companyId": 1,
      "createdAt": "2025-01-01T00:00:00.000+00:00",
      "updatedAt": "2025-01-01T00:00:00.000+00:00",
      "deletedAt": null,
      "company": {
        "id": 1,
        "taxId": "300123456789",
        "registrationNumber": "CR-1234567890",
        "registrationNumberPdf": null,
        "businessLicense": null,
        "contactPerson": "Ahmed Al-Salem",
        "businessAddress": "123 King Fahd Road",
        "city": "Riyadh",
        "userId": 2,
        "createdAt": "2025-01-01T00:00:00.000+00:00",
        "updatedAt": "2025-01-01T00:00:00.000+00:00",
        "deletedAt": null,
        "status": "approved",
        "approvedAt": "2025-01-01T00:00:00.000+00:00",
        "approvedBy": 1,
        "rejectionReason": null,
        "rejectedAt": null,
        "companyProfile": {
          "id": 1,
          "companyName": "Events Co.",
          "description": "We organize events",
          "logo": "https://...",
          "banner": null,
          "website": "https://events.co",
          "socialLinks": null,
          "userId": 2,
          "createdAt": "2025-01-01T00:00:00.000+00:00",
          "updatedAt": "2025-01-01T00:00:00.000+00:00",
          "deletedAt": null
        }
      }
    }
  ]
}
```

---

### GET `/halls/:id`

Get a single hall by ID.

**Response 200:** Single hall object (same shape as items in the list above).

**Response 404:**

```json
{ "message": "Hall not found or not available" }
```

---

### GET `/halls/:id/availability`

Get available time slots for a hall on a specific date.

**Query Parameters:**

| Param  | Type   | Required | Description                                   |
| ------ | ------ | -------- | --------------------------------------------- |
| `date` | string | yes      | Format: `YYYY-MM-DD`, must be today or future |

**Response 200:**

```json
{
  "hallId": 1,
  "hallName": "Grand Hall",
  "date": "2025-06-15",
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

**Response 400:**

```json
{ "message": "Date parameter is required (format: YYYY-MM-DD)" }
```

```json
{ "message": "Invalid date format. Use YYYY-MM-DD" }
```

```json
{ "message": "Cannot check availability for past dates" }
```

---

### GET `/halls/cities`

Get list of cities that have available halls.

**Response 200:**

```json
{ "cities": ["Riyadh", "Jeddah", "Dammam"] }
```

---

## 3. Booking Endpoints

All booking endpoints require authentication. Creating a booking also requires a verified email.

### GET `/users/bookings`

List the authenticated user's bookings.

**Auth:** Bearer token

**Query Parameters:**

| Param    | Type   | Default | Description                                                                                 |
| -------- | ------ | ------- | ------------------------------------------------------------------------------------------- |
| `page`   | number | 1       | Page number                                                                                 |
| `limit`  | number | 20      | Items per page (max 100)                                                                    |
| `status` | string | --      | Filter: `pending`, `accepted`, `rejected`, `confirmed`, `cancelled`, `completed`, `expired` |

**Response 200:** Paginated bookings. Each booking includes:

```json
{
  "meta": { "total": 5, "perPage": 20, "currentPage": 1, "lastPage": 1 },
  "data": [
    {
      "id": 1,
      "bookingDate": "2025-06-15",
      "startTime": "10:00",
      "endTime": "14:00",
      "status": "pending",
      "totalPrice": "2000.00",
      "specialRequests": "Need extra chairs",
      "rejectionReason": null,
      "companyRespondedAt": null,
      "expiresAt": "2025-06-22T00:00:00.000+00:00",
      "paymentStatus": "unpaid",
      "paymentDueDate": null,
      "userId": 1,
      "hallId": 1,
      "createdAt": "2025-06-15T00:00:00.000+00:00",
      "updatedAt": "2025-06-15T00:00:00.000+00:00",
      "deletedAt": null,
      "hall": {
        "id": 1,
        "name": "Grand Hall",
        "pricing": "500.00",
        "city": "Riyadh",
        "company": {
          "id": 1,
          "companyProfile": {
            "companyName": "Events Co.",
            "logo": "https://..."
          }
        }
      },
      "services": [
        {
          "id": 1,
          "name": "Photography",
          "price": "300.00"
        }
      ]
    }
  ]
}
```

---

### POST `/users/bookings`

Create a new booking request.

**Auth:** Bearer token (verified email required)

**Request Body:**

| Field             | Type     | Required | Rules                           |
| ----------------- | -------- | -------- | ------------------------------- |
| `hallId`          | number   | yes      | positive integer                |
| `bookingDate`     | string   | yes      | format `YYYY-MM-DD`             |
| `startTime`       | string   | yes      | format `HH:MM` (e.g. `"10:00"`) |
| `endTime`         | string   | yes      | format `HH:MM` (e.g. `"14:00"`) |
| `serviceIds`      | number[] | no       | array of service IDs            |
| `specialRequests` | string   | no       | max 1000 characters             |

**Pricing:** `((endHour*60 + endMin) - (startHour*60 + startMin)) / 60 * hall.pricing + sum(service prices)`

**Response 201:**

```json
{
  "message": "Booking request submitted successfully. The company has 7 days to respond.",
  "booking": {
    "id": 1,
    "bookingDate": "2025-06-15",
    "startTime": "10:00",
    "endTime": "14:00",
    "status": "pending",
    "totalPrice": "2000.00",
    "paymentStatus": "unpaid",
    "expiresAt": "2025-06-22T00:00:00.000+00:00",
    "hall": {},
    "services": []
  }
}
```

**Response 400:**

```json
{ "message": "Hall not found" }
```

```json
{ "message": "Hall is not available for booking" }
```

```json
{ "message": "The selected time slot is not available" }
```

```json
{ "message": "Booking date must be today or in the future" }
```

```json
{ "message": "End time must be after start time" }
```

```json
{ "message": "One or more selected services are not available for this hall" }
```

---

### GET `/users/bookings/:id`

Get a single booking by ID (must belong to the authenticated user).

**Auth:** Bearer token

**Response 200:** Single booking object (same shape as list items above).

**Response 404:**

```json
{ "message": "Booking not found" }
```

---

### POST `/users/bookings/:id/cancel`

Cancel a pending or accepted booking.

**Auth:** Bearer token

**Response 200:**

```json
{
  "message": "Booking cancelled successfully",
  "booking": { "id": 1, "status": "cancelled" }
}
```

**Response 400:**

```json
{ "message": "Booking not found" }
```

```json
{ "message": "Cannot cancel booking with status: confirmed" }
```

---

## 4. Notification Endpoints

All notification endpoints require the authenticated user to have `userType: "user"`. Company or admin accounts will receive a **403** error:

```json
{ "message": "Access denied. This route is restricted to user accounts." }
```

### GET `/users/notifications`

List the authenticated user's notifications.

**Auth:** Bearer token (user type only)

**Query Parameters:**

| Param         | Type    | Default | Description                                 |
| ------------- | ------- | ------- | ------------------------------------------- |
| `page`        | number  | 1       | Page number                                 |
| `limit`       | number  | 20      | Items per page (max 100)                    |
| `unread_only` | boolean | false   | If `true`, only return unread notifications |

**Response 200:**

```json
{
  "meta": { "total": 10, "perPage": 20, "currentPage": 1, "lastPage": 1 },
  "data": [
    {
      "id": 1,
      "userId": 1,
      "type": "booking_accepted",
      "title": "Booking Accepted",
      "message": "Your booking for Grand Hall on 2025-06-15 has been accepted.",
      "data": { "bookingId": 1 },
      "readAt": null,
      "createdAt": "2025-06-15T00:00:00.000+00:00"
    }
  ]
}
```

---

### GET `/users/notifications/unread-count`

**Auth:** Bearer token

**Response 200:**

```json
{ "unreadCount": 3 }
```

---

### POST `/users/notifications/:id/read`

Mark a single notification as read.

**Auth:** Bearer token

**Response 200:**

```json
{
  "message": "Notification marked as read",
  "notification": { "id": 1, "readAt": "2025-06-15T12:00:00.000+00:00" }
}
```

**Response 404:**

```json
{ "message": "Notification not found" }
```

---

### POST `/users/notifications/read-all`

Mark all notifications as read.

**Auth:** Bearer token

**Response 200:**

```json
{ "message": "All notifications marked as read", "markedCount": 5 }
```

---

## 5. Booking Status Flow

```
pending --> accepted --> confirmed --> completed
   |            |
   |            +--> cancelled (by user)
   |
   +--> rejected (by company)
   +--> cancelled (by user)
   +--> expired (after 7 days with no company response)
```

- **pending**: Booking created, waiting for company response. Expires in 7 days.
- **accepted**: Company accepted. Payment due within 3 days (`paymentDueDate` is set).
- **rejected**: Company rejected with a reason (`rejectionReason`).
- **confirmed**: Payment completed.
- **cancelled**: User cancelled (only from `pending` or `accepted`).
- **expired**: No company response within 7 days.
- **completed**: Event date has passed.

## 6. Data Types Reference

### Pagination Envelope

All paginated responses use this shape:

```json
{
  "meta": {
    "total": 50,
    "perPage": 20,
    "currentPage": 1,
    "lastPage": 3,
    "firstPage": 1,
    "firstPageUrl": "/?page=1",
    "lastPageUrl": "/?page=3",
    "nextPageUrl": "/?page=2",
    "previousPageUrl": null
  },
  "data": []
}
```

### DateTime Format

All datetime fields are ISO 8601: `"2025-01-15T14:30:00.000+00:00"`

Date-only fields (like `bookingDate`): `"2025-01-15"`

Time fields (`startTime`, `endTime`): `"HH:MM"` (e.g. `"14:00"`)

### JSON Field Keys

Both request and response use **camelCase** keys throughout (e.g. `companyName`, `startTime`, `totalPrice`, `perPage`, `createdAt`).

### Numeric Fields

Price fields (`pricing`, `totalPrice`, `price`) are returned as **strings** (e.g. `"500.00"`) due to PostgreSQL decimal type. Parse them as numbers on the client side.
