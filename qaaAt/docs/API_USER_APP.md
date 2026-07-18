# QaaAt User Mobile App - API Documentation

Base URL: `https://api.qaat.app` (production) or `http://localhost:3333` (development)

All endpoints use JSON. Include `Content-Type: application/json` header.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Email Verification](#email-verification)
3. [Browse Halls](#browse-halls)
4. [Bookings](#bookings)
5. [Notifications](#notifications)
6. [Error Handling](#error-handling)
7. [User Flow Diagram](#user-flow-diagram)

---

## Authentication

### Register

Create a new user account.

```
POST /api/users/register
```

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "userName": "John Doe",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+966501234567",
  "address": "Riyadh, Saudi Arabia"
}
```

| Field     | Type   | Required | Description         |
| --------- | ------ | -------- | ------------------- |
| email     | string | Yes      | Valid email address |
| password  | string | Yes      | Min 8 characters    |
| userName  | string | No       | Display name        |
| firstName | string | No       | First name          |
| lastName  | string | No       | Last name           |
| phone     | string | No       | Phone number        |
| address   | string | No       | Address             |

**Response (201 Created):**

```json
{
  "message": "User registered successfully. Please check your email to verify your account.",
  "user": {
    "id": 1,
    "userName": "John Doe",
    "email": "user@example.com",
    "userType": "user",
    "emailVerified": false
  },
  "token": {
    "type": "bearer",
    "token": "oat_MjQ.dGhpcyBpcyBhIHNhbXBsZSB0b2tlbg"
  }
}
```

**Important:** After registration, user receives a verification email. Store the token for authenticated requests.

---

### Login

Authenticate an existing user.

```
POST /api/users/login
```

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200 OK):**

```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "userName": "John Doe",
    "email": "user@example.com",
    "userType": "user",
    "emailVerified": true
  },
  "token": {
    "type": "bearer",
    "token": "oat_MjQ.dGhpcyBpcyBhIHNhbXBsZSB0b2tlbg"
  }
}
```

**Error Response (401 Unauthorized):**

```json
{
  "message": "Invalid credentials"
}
```

---

### Get Current User

Get the authenticated user's profile.

```
GET /api/users/me
Authorization: Bearer {token}
```

**Response (200 OK):**

```json
{
  "user": {
    "id": 1,
    "userName": "John Doe",
    "email": "user@example.com",
    "userType": "user",
    "emailVerified": true,
    "profile": {
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+966501234567",
      "address": "Riyadh, Saudi Arabia"
    }
  }
}
```

---

### Logout

Revoke the current access token.

```
POST /api/users/logout
Authorization: Bearer {token}
```

**Response (200 OK):**

```json
{
  "message": "Logged out successfully"
}
```

---

## Email Verification

### Verify Email

Called when user enters the verification code from their email.

```
POST /api/users/verify-email
```

**Request Body:**

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response (200 OK):**

```json
{
  "message": "Email verified successfully",
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "emailVerified": true
    }
  }
}
```

**Error Response (422 Unprocessable Entity):**

```json
{
  "error": {
    "code": "INVALID_VERIFICATION_CODE",
    "message": "Invalid verification code"
  }
}
```

---

### Resend Verification Email

Request a new verification email.

```
POST /api/users/resend-verification
```

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**

```json
{
  "message": "If an account with that email exists and is not verified, a verification code has been sent."
}
```

---

## Browse Halls

### List All Halls

Browse available halls with optional filters.

```
GET /api/halls
```

**Query Parameters:**

| Parameter    | Type   | Description                           |
| ------------ | ------ | ------------------------------------- |
| page         | number | Page number (default: 1)              |
| limit        | number | Items per page (default: 20)          |
| city         | string | Filter by city                        |
| min_capacity | number | Minimum capacity                      |
| max_price    | number | Maximum price per hour                |
| search       | string | Search in name, description, location |

**Example:**

```
GET /api/halls?city=Riyadh&min_capacity=100&max_price=5000&page=1&limit=10
```

**Response (200 OK):**

```json
{
  "meta": {
    "total": 45,
    "perPage": 10,
    "currentPage": 1,
    "lastPage": 5,
    "firstPage": 1
  },
  "data": [
    {
      "id": 1,
      "name": "Royal Grand Hall",
      "description": "Luxurious wedding hall with modern amenities",
      "capacity": 500,
      "location": "Al Olaya District",
      "pricing": 3000,
      "images": ["https://...", "https://..."],
      "address": "123 King Fahd Road",
      "city": "Riyadh",
      "amenities": {
        "parking": true,
        "wifi": true,
        "catering": true,
        "sound_system": true
      },
      "isAvailable": true,
      "company": {
        "id": 1,
        "companyProfile": {
          "companyName": "Royal Events Co.",
          "logo": "https://...",
          "description": "Premium event venues"
        }
      }
    }
  ]
}
```

---

### Get Hall Details

Get detailed information about a specific hall.

```
GET /api/halls/{id}
```

**Response (200 OK):**

```json
{
  "id": 1,
  "name": "Royal Grand Hall",
  "description": "Luxurious wedding hall with modern amenities",
  "capacity": 500,
  "location": "Al Olaya District",
  "pricing": 3000,
  "images": ["https://...", "https://..."],
  "address": "123 King Fahd Road",
  "city": "Riyadh",
  "amenities": {
    "parking": true,
    "wifi": true,
    "catering": true
  },
  "additionalServices": {
    "decoration": 2000,
    "photography": 3000
  },
  "isAvailable": true,
  "company": {
    "id": 1,
    "companyProfile": {
      "companyName": "Royal Events Co.",
      "logo": "https://...",
      "website": "https://royalevents.sa"
    }
  }
}
```

---

### Get Available Cities

Get list of cities that have available halls.

```
GET /api/halls/cities
```

**Response (200 OK):**

```json
{
  "cities": ["Riyadh", "Jeddah", "Dammam", "Makkah", "Madinah"]
}
```

---

### Check Hall Availability

Get available time slots for a specific date.

```
GET /api/halls/{id}/availability?date=2024-06-15
```

**Query Parameters:**

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| date      | string | Yes      | Date in YYYY-MM-DD format |

**Response (200 OK):**

```json
{
  "hallId": 1,
  "hallName": "Royal Grand Hall",
  "date": "2024-06-15",
  "slots": [
    { "startTime": "08:00", "endTime": "10:00", "isAvailable": true },
    { "startTime": "10:00", "endTime": "12:00", "isAvailable": true },
    { "startTime": "12:00", "endTime": "14:00", "isAvailable": false },
    { "startTime": "14:00", "endTime": "16:00", "isAvailable": true },
    { "startTime": "16:00", "endTime": "18:00", "isAvailable": false },
    { "startTime": "18:00", "endTime": "20:00", "isAvailable": true },
    { "startTime": "20:00", "endTime": "22:00", "isAvailable": true }
  ]
}
```

---

## Bookings

> **Important:** User must have verified email to create bookings.

### Create Booking

Submit a booking request.

```
POST /api/users/bookings
Authorization: Bearer {token}
```

**Request Body:**

```json
{
  "hallId": 1,
  "bookingDate": "2024-06-15",
  "startTime": "18:00",
  "endTime": "22:00",
  "serviceIds": [1, 2],
  "specialRequests": "Please arrange for valet parking"
}
```

| Field           | Type     | Required | Description                       |
| --------------- | -------- | -------- | --------------------------------- |
| hallId          | number   | Yes      | Hall ID                           |
| bookingDate     | string   | Yes      | Date (YYYY-MM-DD)                 |
| startTime       | string   | Yes      | Start time (HH:MM)                |
| endTime         | string   | Yes      | End time (HH:MM)                  |
| serviceIds      | number[] | No       | Array of additional service IDs   |
| specialRequests | string   | No       | Special requests (max 1000 chars) |

**Response (201 Created):**

```json
{
  "message": "Booking request submitted successfully. The company has 7 days to respond.",
  "booking": {
    "id": 1,
    "bookingDate": "2024-06-15",
    "startTime": "18:00",
    "endTime": "22:00",
    "status": "pending",
    "totalPrice": 15000,
    "paymentStatus": "unpaid",
    "expiresAt": "2024-06-08T12:00:00.000Z",
    "specialRequests": "Please arrange for valet parking",
    "hall": {
      "id": 1,
      "name": "Royal Grand Hall",
      "company": {
        "companyProfile": {
          "companyName": "Royal Events Co."
        }
      }
    },
    "services": [
      { "id": 1, "name": "Decoration", "price": 2000 },
      { "id": 2, "name": "Photography", "price": 3000 }
    ]
  }
}
```

**Error Responses:**

_Email not verified (403):_

```json
{
  "message": "Please verify your email address before proceeding.",
  "code": "EMAIL_NOT_VERIFIED"
}
```

_Time slot not available (400):_

```json
{
  "message": "The selected time slot is not available"
}
```

---

### List My Bookings

Get all bookings for the authenticated user.

```
GET /api/users/bookings
Authorization: Bearer {token}
```

**Query Parameters:**

| Parameter | Type   | Description                  |
| --------- | ------ | ---------------------------- |
| page      | number | Page number (default: 1)     |
| limit     | number | Items per page (default: 20) |
| status    | string | Filter by status             |

**Status Values:** `pending`, `accepted`, `rejected`, `confirmed`, `cancelled`, `completed`, `expired`

**Response (200 OK):**

```json
{
  "meta": {
    "total": 5,
    "perPage": 20,
    "currentPage": 1
  },
  "data": [
    {
      "id": 1,
      "bookingDate": "2024-06-15",
      "startTime": "18:00",
      "endTime": "22:00",
      "status": "pending",
      "totalPrice": 15000,
      "paymentStatus": "unpaid",
      "expiresAt": "2024-06-08T12:00:00.000Z",
      "hall": {
        "id": 1,
        "name": "Royal Grand Hall",
        "images": ["https://..."]
      }
    },
    {
      "id": 2,
      "bookingDate": "2024-07-20",
      "startTime": "14:00",
      "endTime": "18:00",
      "status": "accepted",
      "totalPrice": 12000,
      "paymentStatus": "unpaid",
      "paymentDueDate": "2024-06-05T12:00:00.000Z",
      "hall": {
        "id": 2,
        "name": "Garden Palace",
        "images": ["https://..."]
      }
    }
  ]
}
```

---

### Get Booking Details

Get details of a specific booking.

```
GET /api/users/bookings/{id}
Authorization: Bearer {token}
```

**Response (200 OK):**

```json
{
  "id": 1,
  "bookingDate": "2024-06-15",
  "startTime": "18:00",
  "endTime": "22:00",
  "status": "accepted",
  "totalPrice": 15000,
  "paymentStatus": "unpaid",
  "paymentDueDate": "2024-06-05T12:00:00.000Z",
  "specialRequests": "Please arrange for valet parking",
  "rejectionReason": null,
  "hall": {
    "id": 1,
    "name": "Royal Grand Hall",
    "address": "123 King Fahd Road",
    "city": "Riyadh",
    "images": ["https://..."],
    "company": {
      "companyProfile": {
        "companyName": "Royal Events Co.",
        "phone": "+966501234567"
      }
    }
  },
  "services": [
    { "id": 1, "name": "Decoration", "price": 2000 },
    { "id": 2, "name": "Photography", "price": 3000 }
  ]
}
```

---

### Cancel Booking

Cancel a pending or accepted booking.

```
PATCH /api/users/bookings/{id}/cancel
Authorization: Bearer {token}
```

**Response (200 OK):**

```json
{
  "message": "Booking cancelled successfully",
  "booking": {
    "id": 1,
    "status": "cancelled"
  }
}
```

**Error (400 Bad Request):**

```json
{
  "message": "Cannot cancel booking with status: completed"
}
```

---

## Notifications

### List Notifications

Get all notifications for the user.

```
GET /api/users/notifications
Authorization: Bearer {token}
```

**Query Parameters:**

| Parameter   | Type    | Description                    |
| ----------- | ------- | ------------------------------ |
| page        | number  | Page number (default: 1)       |
| limit       | number  | Items per page (default: 20)   |
| unread_only | boolean | Only show unread notifications |

**Response (200 OK):**

```json
{
  "meta": {
    "total": 10,
    "perPage": 20,
    "currentPage": 1
  },
  "data": [
    {
      "id": 1,
      "type": "booking_accepted",
      "title": "Booking Confirmed",
      "message": "Great news! Your booking for \"Royal Grand Hall\" on 2024-06-15 has been accepted.",
      "data": {
        "bookingId": 1,
        "hallName": "Royal Grand Hall",
        "bookingDate": "2024-06-15"
      },
      "readAt": null,
      "createdAt": "2024-06-02T10:30:00.000Z"
    },
    {
      "id": 2,
      "type": "booking_rejected",
      "title": "Booking Rejected",
      "message": "Unfortunately, your booking for \"Garden Palace\" on 2024-07-01 was rejected.",
      "data": {
        "bookingId": 2,
        "hallName": "Garden Palace",
        "reason": "Hall is under maintenance during this period"
      },
      "readAt": "2024-06-01T15:00:00.000Z",
      "createdAt": "2024-06-01T14:00:00.000Z"
    }
  ]
}
```

**Notification Types:**

- `booking_accepted` - Booking was accepted by company
- `booking_rejected` - Booking was rejected by company
- `booking_expired` - Booking expired (company didn't respond in 7 days)
- `email_verified` - Email was verified

---

### Get Unread Count

Get the count of unread notifications.

```
GET /api/users/notifications/unread-count
Authorization: Bearer {token}
```

**Response (200 OK):**

```json
{
  "unreadCount": 3
}
```

---

### Mark as Read

Mark a single notification as read.

```
PATCH /api/users/notifications/{id}/read
Authorization: Bearer {token}
```

**Response (200 OK):**

```json
{
  "message": "Notification marked as read",
  "notification": {
    "id": 1,
    "readAt": "2024-06-02T12:00:00.000Z"
  }
}
```

---

### Mark All as Read

Mark all notifications as read.

```
PATCH /api/users/notifications/read-all
Authorization: Bearer {token}
```

**Response (200 OK):**

```json
{
  "message": "All notifications marked as read",
  "markedCount": 5
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning                              |
| ---- | ------------------------------------ |
| 200  | Success                              |
| 201  | Created                              |
| 400  | Bad Request - Invalid input          |
| 401  | Unauthorized - Invalid/missing token |
| 403  | Forbidden - No permission            |
| 404  | Not Found                            |
| 422  | Validation Error                     |
| 500  | Server Error                         |

### Error Response Format

```json
{
  "message": "Error description",
  "code": "ERROR_CODE",
  "errors": [
    {
      "field": "email",
      "message": "Email is required"
    }
  ]
}
```

### Common Error Codes

| Code                  | Description                |
| --------------------- | -------------------------- |
| `EMAIL_NOT_VERIFIED`  | User needs to verify email |
| `INVALID_CREDENTIALS` | Wrong email or password    |
| `TOKEN_EXPIRED`       | Auth token has expired     |

---

## User Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER JOURNEY                              │
└─────────────────────────────────────────────────────────────────┘

1. REGISTRATION & VERIFICATION
   ┌──────────┐    ┌──────────────┐    ┌──────────────┐
   │ Register │───▶│ Receive Email│───▶│ Verify Email │
   └──────────┘    └──────────────┘    └──────────────┘
        │                                      │
        ▼                                      ▼
   ┌──────────┐                         ┌──────────────┐
   │  Login   │◀────────────────────────│ Can now book │
   └──────────┘                         └──────────────┘

2. BOOKING FLOW
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │ Browse Halls │───▶│ Check Avail. │───▶│ Create Book. │
   └──────────────┘    └──────────────┘    └──────────────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │   PENDING    │
                                          │ (7 day wait) │
                                          └──────────────┘
                                                  │
                            ┌─────────────────────┼─────────────────────┐
                            ▼                     ▼                     ▼
                     ┌──────────┐          ┌──────────┐          ┌──────────┐
                     │ ACCEPTED │          │ REJECTED │          │ EXPIRED  │
                     └──────────┘          └──────────┘          └──────────┘
                            │                     │                     │
                            ▼                     │                     │
                     ┌──────────┐                 │                     │
                     │   PAY    │                 │                     │
                     └──────────┘                 │                     │
                            │                     │                     │
                            ▼                     ▼                     ▼
                     ┌──────────┐          ┌───────────────────────────────┐
                     │CONFIRMED │          │     Notification Received      │
                     └──────────┘          └───────────────────────────────┘

3. BOOKING STATUSES
   • pending   - Waiting for company response (7 days max)
   • accepted  - Company accepted, awaiting payment
   • rejected  - Company rejected (with reason)
   • confirmed - Payment completed
   • cancelled - Cancelled by user
   • completed - Event finished
   • expired   - Company didn't respond in time
```

---

## Implementation Notes

### Token Storage

Store the JWT token securely (e.g., secure storage, keychain).

### Token Usage

Include in all authenticated requests:

```
Authorization: Bearer {token}
```

### Polling for Notifications

Poll `/api/users/notifications/unread-count` periodically (e.g., every 30 seconds) to update badge count.

### Handling Token Expiry

If you receive a 401 response, redirect user to login screen.

### Date/Time Format

- Dates: `YYYY-MM-DD` (e.g., "2024-06-15")
- Times: `HH:MM` 24-hour format (e.g., "18:00")
- Timestamps: ISO 8601 (e.g., "2024-06-02T10:30:00.000Z")
