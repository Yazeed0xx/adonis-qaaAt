# QaaAt Company Mobile App - API Documentation

Base URL: `https://api.qaat.app` (production) or `http://localhost:3333` (development)

All endpoints use JSON. Include `Content-Type: application/json` header.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Company Status](#company-status)
3. [Hall Management](#hall-management)
4. [Booking Management](#booking-management)
5. [Notifications](#notifications)
6. [Error Handling](#error-handling)
7. [Company Flow Diagram](#company-flow-diagram)

---

## Authentication

### Register Company

Create a new company account.

```
POST /api/companies/register
```

**Request Body:**

```json
{
  "email": "company@example.com",
  "password": "securePassword123",
  "companyName": "Royal Events Co.",
  "city": "Riyadh",
  "taxId": "123456789",
  "registrationNumber": "CR-123456",
  "registrationNumberPdf": "https://storage.example.com/docs/cr.pdf",
  "businessLicense": "https://storage.example.com/docs/license.pdf",
  "contactPerson": "Ahmed Al-Rashid",
  "businessAddress": "123 King Fahd Road, Al Olaya",
  "description": "Premium wedding and event venues",
  "logo": "https://storage.example.com/logos/royal.png",
  "banner": "https://storage.example.com/banners/royal.jpg",
  "website": "https://royalevents.sa",
  "socialLinks": {
    "instagram": "@royalevents",
    "twitter": "@royalevents_sa"
  }
}
```

| Field                 | Type   | Required | Description             |
| --------------------- | ------ | -------- | ----------------------- |
| email                 | string | Yes      | Company email           |
| password              | string | Yes      | Min 8 characters        |
| companyName           | string | Yes      | Company name            |
| city                  | string | Yes      | City of operation       |
| taxId                 | string | No       | Tax ID number           |
| registrationNumber    | string | No       | Commercial registration |
| registrationNumberPdf | string | No       | URL to CR document      |
| businessLicense       | string | No       | URL to license document |
| contactPerson         | string | No       | Contact person name     |
| businessAddress       | string | No       | Business address        |
| description           | string | No       | Company description     |
| logo                  | string | No       | Logo URL                |
| banner                | string | No       | Banner image URL        |
| website               | string | No       | Company website         |
| socialLinks           | object | No       | Social media links      |

**Response (201 Created):**

```json
{
  "message": "Company registered successfully. Your account is pending admin approval.",
  "user": {
    "id": 1,
    "email": "company@example.com",
    "userType": "company"
  },
  "company": {
    "id": 1,
    "companyName": "Royal Events Co.",
    "city": "Riyadh",
    "status": "pending"
  },
  "token": {
    "type": "bearer",
    "token": "oat_MjQ.dGhpcyBpcyBhIHNhbXBsZSB0b2tlbg"
  }
}
```

> **Important:** After registration, the company status is `pending`. Admin must approve the company before it can create halls and receive bookings.

---

### Login

Authenticate an existing company.

```
POST /api/companies/login
```

**Request Body:**

```json
{
  "email": "company@example.com",
  "password": "securePassword123"
}
```

**Response (200 OK):**

```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "email": "company@example.com",
    "userType": "company"
  },
  "company": {
    "id": 1,
    "status": "approved",
    "city": "Riyadh",
    "companyProfile": {
      "companyName": "Royal Events Co.",
      "logo": "https://..."
    }
  },
  "token": {
    "type": "bearer",
    "token": "oat_MjQ.dGhpcyBpcyBhIHNhbXBsZSB0b2tlbg"
  }
}
```

**Response with pending status:**

```json
{
  "message": "Login successful. Your company is pending admin approval.",
  "user": { ... },
  "company": {
    "id": 1,
    "status": "pending",
    ...
  },
  "token": { ... }
}
```

---

### Get Current Company

Get the authenticated company's profile.

```
GET /api/companies/me
Authorization: Bearer {token}
```

**Response (200 OK):**

```json
{
  "user": {
    "id": 1,
    "email": "company@example.com",
    "userType": "company"
  },
  "company": {
    "id": 1,
    "taxId": "123456789",
    "registrationNumber": "CR-123456",
    "contactPerson": "Ahmed Al-Rashid",
    "businessAddress": "123 King Fahd Road",
    "city": "Riyadh",
    "status": "approved",
    "approvedAt": "2024-05-15T10:00:00.000Z",
    "companyProfile": {
      "companyName": "Royal Events Co.",
      "description": "Premium wedding and event venues",
      "logo": "https://...",
      "banner": "https://...",
      "website": "https://royalevents.sa"
    }
  }
}
```

---

### Logout

Revoke the current access token.

```
POST /api/companies/logout
Authorization: Bearer {token}
```

**Response (200 OK):**

```json
{
  "message": "Logged out successfully"
}
```

---

## Company Status

### Understanding Company Status

| Status      | Description                | Can Create Halls | Can Receive Bookings |
| ----------- | -------------------------- | ---------------- | -------------------- |
| `pending`   | Waiting for admin approval | No               | No                   |
| `approved`  | Approved and active        | Yes              | Yes                  |
| `rejected`  | Registration rejected      | No               | No                   |
| `suspended` | Temporarily suspended      | No               | No                   |

### Status-Based UI Recommendations

**When status = `pending`:**

- Show "Pending Approval" banner
- Disable hall creation features
- Show message: "Your company is being reviewed. This usually takes 1-2 business days."

**When status = `rejected`:**

- Show rejection reason from `company.rejectionReason`
- Provide contact support option
- Example message: "Your registration was rejected: [reason]"

**When status = `suspended`:**

- Show suspension notice
- Disable all management features
- Provide contact support option

**When status = `approved`:**

- Full access to all features

### Error When Not Approved

Any request to hall or booking management when not approved:

```json
{
  "message": "Your company is pending admin approval. You cannot perform this action yet.",
  "code": "COMPANY_PENDING_APPROVAL"
}
```

---

## Hall Management

> **Requires:** Company status must be `approved`

### List My Halls

Get all halls owned by the company.

```
GET /api/companies/halls
Authorization: Bearer {token}
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20) |

**Response (200 OK):**

```json
{
  "meta": {
    "total": 3,
    "perPage": 20,
    "currentPage": 1
  },
  "data": [
    {
      "id": 1,
      "name": "Royal Grand Hall",
      "description": "Luxurious wedding hall",
      "capacity": 500,
      "location": "Al Olaya District",
      "pricing": 3000,
      "images": ["https://...", "https://..."],
      "address": "123 King Fahd Road",
      "city": "Riyadh",
      "isAvailable": true,
      "createdAt": "2024-05-20T10:00:00.000Z"
    }
  ]
}
```

---

### Get Hall Details

Get details of a specific hall.

```
GET /api/companies/halls/{id}
Authorization: Bearer {token}
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
    "catering": true,
    "sound_system": true,
    "stage": true
  },
  "additionalServices": {
    "decoration": 2000,
    "photography": 3000,
    "video": 2500
  },
  "isAvailable": true,
  "bookings": [
    {
      "id": 1,
      "bookingDate": "2024-06-15",
      "status": "confirmed"
    }
  ]
}
```

---

### Create Hall

Create a new hall.

```
POST /api/companies/halls
Authorization: Bearer {token}
```

**Request Body:**

```json
{
  "name": "Royal Grand Hall",
  "description": "Luxurious wedding hall with modern amenities and elegant decor",
  "capacity": 500,
  "location": "Al Olaya District",
  "pricing": 3000,
  "images": [
    "https://storage.example.com/halls/royal1.jpg",
    "https://storage.example.com/halls/royal2.jpg"
  ],
  "address": "123 King Fahd Road",
  "city": "Riyadh",
  "amenities": {
    "parking": true,
    "wifi": true,
    "catering": true,
    "sound_system": true
  },
  "additionalServices": {
    "decoration": 2000,
    "photography": 3000
  },
  "additionalFeatures": {
    "bridal_suite": true,
    "outdoor_area": true
  },
  "isAvailable": true
}
```

| Field              | Type     | Required | Description                  |
| ------------------ | -------- | -------- | ---------------------------- |
| name               | string   | Yes      | Hall name                    |
| description        | string   | No       | Detailed description         |
| capacity           | number   | Yes      | Maximum capacity             |
| location           | string   | Yes      | Area/district                |
| pricing            | number   | Yes      | Price per hour (SAR)         |
| images             | string[] | No       | Array of image URLs          |
| address            | string   | Yes      | Full address                 |
| city               | string   | Yes      | City                         |
| amenities          | object   | No       | Available amenities          |
| additionalServices | object   | No       | Extra services with prices   |
| additionalFeatures | object   | No       | Special features             |
| isAvailable        | boolean  | No       | Availability (default: true) |

**Response (201 Created):**

```json
{
  "message": "Hall created successfully",
  "hall": {
    "id": 1,
    "name": "Royal Grand Hall",
    "capacity": 500,
    "pricing": 3000,
    "isAvailable": true,
    "createdAt": "2024-05-20T10:00:00.000Z"
  }
}
```

---

### Update Hall

Update an existing hall.

```
PUT /api/companies/halls/{id}
Authorization: Bearer {token}
```

**Request Body:** (same as create, all fields optional)

```json
{
  "pricing": 3500,
  "isAvailable": false,
  "description": "Updated description..."
}
```

**Response (200 OK):**

```json
{
  "message": "Hall updated successfully",
  "hall": {
    "id": 1,
    "name": "Royal Grand Hall",
    "pricing": 3500,
    "isAvailable": false
  }
}
```

---

### Delete Hall

Delete a hall.

```
DELETE /api/companies/halls/{id}
Authorization: Bearer {token}
```

**Response (200 OK):**

```json
{
  "message": "Hall deleted successfully"
}
```

---

## Booking Management

> **Requires:** Company status must be `approved`

### List All Bookings

Get all bookings for the company's halls.

```
GET /api/companies/bookings
Authorization: Bearer {token}
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20) |
| status | string | Filter by status |

**Response (200 OK):**

```json
{
  "meta": {
    "total": 25,
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
      "createdAt": "2024-06-01T10:00:00.000Z",
      "hall": {
        "id": 1,
        "name": "Royal Grand Hall"
      },
      "user": {
        "id": 1,
        "userName": "John Doe",
        "email": "user@example.com"
      },
      "services": [{ "id": 1, "name": "Decoration" }]
    }
  ]
}
```

---

### List Pending Bookings

Get bookings that need company response (pending and not expired).

```
GET /api/companies/bookings/pending
Authorization: Bearer {token}
```

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
      "expiresAt": "2024-06-08T12:00:00.000Z",
      "specialRequests": "Please arrange valet parking",
      "createdAt": "2024-06-01T10:00:00.000Z",
      "hall": {
        "id": 1,
        "name": "Royal Grand Hall"
      },
      "user": {
        "id": 1,
        "userName": "John Doe",
        "email": "user@example.com",
        "userProfile": {
          "phone": "+966501234567"
        }
      }
    }
  ]
}
```

> **Note:** Pending bookings are sorted by `createdAt` ascending (oldest first) to help prioritize responses.

---

### Get Booking Details

Get details of a specific booking.

```
GET /api/companies/bookings/{id}
Authorization: Bearer {token}
```

**Response (200 OK):**

```json
{
  "id": 1,
  "bookingDate": "2024-06-15",
  "startTime": "18:00",
  "endTime": "22:00",
  "status": "pending",
  "totalPrice": 15000,
  "paymentStatus": "unpaid",
  "specialRequests": "Please arrange valet parking and extra chairs",
  "expiresAt": "2024-06-08T12:00:00.000Z",
  "createdAt": "2024-06-01T10:00:00.000Z",
  "hall": {
    "id": 1,
    "name": "Royal Grand Hall",
    "pricing": 3000
  },
  "user": {
    "id": 1,
    "userName": "John Doe",
    "email": "user@example.com",
    "userProfile": {
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+966501234567",
      "address": "Riyadh"
    }
  },
  "services": [
    { "id": 1, "name": "Decoration", "price": 2000 },
    { "id": 2, "name": "Photography", "price": 3000 }
  ]
}
```

---

### Accept Booking

Accept a pending booking request.

```
PATCH /api/companies/bookings/{id}/accept
Authorization: Bearer {token}
```

**Response (200 OK):**

```json
{
  "message": "Booking accepted successfully. The customer will be notified to proceed with payment.",
  "booking": {
    "id": 1,
    "status": "accepted",
    "paymentDueDate": "2024-06-05T12:00:00.000Z"
  }
}
```

**What happens:**

1. Booking status changes to `accepted`
2. Payment due date is set (3 days from acceptance)
3. User receives notification (in-app + email)

**Error Responses:**

_Not pending (400):_

```json
{
  "message": "Cannot accept booking with status: rejected"
}
```

_Expired (400):_

```json
{
  "message": "Cannot accept expired booking"
}
```

---

### Reject Booking

Reject a pending booking request with a reason.

```
PATCH /api/companies/bookings/{id}/reject
Authorization: Bearer {token}
```

**Request Body:**

```json
{
  "reason": "The hall is under maintenance during the requested dates. We apologize for the inconvenience."
}
```

| Field  | Type   | Required | Description                                    |
| ------ | ------ | -------- | ---------------------------------------------- |
| reason | string | Yes      | Rejection reason (min 10 chars, max 500 chars) |

**Response (200 OK):**

```json
{
  "message": "Booking rejected. The customer will be notified.",
  "booking": {
    "id": 1,
    "status": "rejected",
    "rejectionReason": "The hall is under maintenance during the requested dates."
  }
}
```

**What happens:**

1. Booking status changes to `rejected`
2. Rejection reason is stored
3. User receives notification with the reason (in-app + email)

**Error Responses:**

_Reason too short (400):_

```json
{
  "message": "Rejection reason is required and must be at least 10 characters"
}
```

---

## Notifications

### List Notifications

Get all notifications for the company.

```
GET /api/companies/notifications
Authorization: Bearer {token}
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20) |
| unread_only | boolean | Only show unread notifications |

**Response (200 OK):**

```json
{
  "meta": {
    "total": 15,
    "perPage": 20,
    "currentPage": 1
  },
  "data": [
    {
      "id": 1,
      "type": "new_booking_request",
      "title": "New Booking Request",
      "message": "You have a new booking request from a customer for \"Royal Grand Hall\" on 2024-06-15. Please review and respond within 7 days.",
      "data": {
        "bookingId": 1,
        "hallName": "Royal Grand Hall",
        "bookingDate": "2024-06-15",
        "userName": "A customer"
      },
      "readAt": null,
      "createdAt": "2024-06-01T10:00:00.000Z"
    },
    {
      "id": 2,
      "type": "company_approved",
      "title": "Company Approved",
      "message": "Congratulations! Your company \"Royal Events Co.\" has been approved.",
      "data": null,
      "readAt": "2024-05-16T09:00:00.000Z",
      "createdAt": "2024-05-15T10:00:00.000Z"
    }
  ]
}
```

**Notification Types:**

- `new_booking_request` - New booking request received
- `company_approved` - Company was approved by admin
- `company_rejected` - Company was rejected by admin

---

### Get Unread Count

Get the count of unread notifications.

```
GET /api/companies/notifications/unread-count
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
PATCH /api/companies/notifications/{id}/read
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
PATCH /api/companies/notifications/read-all
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

| Code | Meaning                                   |
| ---- | ----------------------------------------- |
| 200  | Success                                   |
| 201  | Created                                   |
| 400  | Bad Request - Invalid input               |
| 401  | Unauthorized - Invalid/missing token      |
| 403  | Forbidden - No permission or not approved |
| 404  | Not Found                                 |
| 422  | Validation Error                          |
| 500  | Server Error                              |

### Common Error Codes

| Code                       | Description              |
| -------------------------- | ------------------------ |
| `COMPANY_PENDING_APPROVAL` | Company not yet approved |
| `COMPANY_REJECTED`         | Company was rejected     |
| `COMPANY_SUSPENDED`        | Company is suspended     |
| `INVALID_CREDENTIALS`      | Wrong email or password  |

### Error Response Format

```json
{
  "message": "Error description",
  "code": "ERROR_CODE",
  "reason": "Additional context (for rejections)"
}
```

---

## Company Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      COMPANY JOURNEY                             │
└─────────────────────────────────────────────────────────────────┘

1. REGISTRATION & APPROVAL
   ┌──────────┐    ┌───────────────┐    ┌──────────────┐
   │ Register │───▶│    PENDING    │───▶│   APPROVED   │
   └──────────┘    │  (Admin Rev.) │    └──────────────┘
                   └───────────────┘           │
                          │                    │
                          ▼                    ▼
                   ┌──────────────┐    ┌──────────────┐
                   │   REJECTED   │    │ Create Halls │
                   │ (with reason)│    └──────────────┘
                   └──────────────┘

2. HALL MANAGEMENT
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │ Create Hall  │───▶│ Update Hall  │───▶│ Toggle Avail │
   └──────────────┘    └──────────────┘    └──────────────┘

3. BOOKING MANAGEMENT
   ┌───────────────────────────────────────────────────────────┐
   │                    NEW BOOKING REQUEST                     │
   │                   (Notification Received)                  │
   └───────────────────────────────────────────────────────────┘
                              │
                              ▼
   ┌───────────────────────────────────────────────────────────┐
   │                    REVIEW BOOKING                          │
   │  • Check date/time                                        │
   │  • Check special requests                                 │
   │  • Verify availability                                    │
   └───────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
       ┌──────────┐                    ┌──────────┐
       │  ACCEPT  │                    │  REJECT  │
       └──────────┘                    │ (reason) │
              │                        └──────────┘
              ▼                               │
       ┌──────────────┐                       │
       │ User Pays    │                       │
       └──────────────┘                       │
              │                               │
              ▼                               ▼
       ┌──────────────┐              ┌──────────────────┐
       │  CONFIRMED   │              │ User Notified    │
       │  (Booked!)   │              │ (with reason)    │
       └──────────────┘              └──────────────────┘

4. BOOKING STATUSES (Company Perspective)
   • pending   → Action needed: Accept or Reject within 7 days
   • accepted  → Waiting for customer payment
   • rejected  → Closed (rejected by you)
   • confirmed → Payment received, event scheduled
   • cancelled → Customer cancelled
   • completed → Event finished
   • expired   → You didn't respond in time (auto-closed)

5. RESPONSE TIME
   ┌─────────────────────────────────────────────────────────┐
   │  ⚠️  You have 7 DAYS to respond to booking requests    │
   │                                                         │
   │  If no response: Booking auto-expires and customer     │
   │  is notified that you didn't respond.                  │
   └─────────────────────────────────────────────────────────┘
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

### Polling Recommendations

**Notifications:**
Poll `/api/companies/notifications/unread-count` every 30 seconds.

**Pending Bookings:**
Poll `/api/companies/bookings/pending` periodically to check for new requests.

### Handling Company Status

On app launch and after login, check company status:

```javascript
if (company.status === 'pending') {
  showPendingApprovalScreen()
} else if (company.status === 'rejected') {
  showRejectionScreen(company.rejectionReason)
} else if (company.status === 'suspended') {
  showSuspensionScreen()
} else {
  showDashboard()
}
```

### Date/Time Format

- Dates: `YYYY-MM-DD` (e.g., "2024-06-15")
- Times: `HH:MM` 24-hour format (e.g., "18:00")
- Timestamps: ISO 8601 (e.g., "2024-06-02T10:30:00.000Z")

### Best Practices

1. **Respond to bookings promptly** - Users expect quick responses
2. **Provide clear rejection reasons** - Helps maintain good customer relations
3. **Keep hall information updated** - Accurate pricing and availability
4. **Monitor notifications** - Don't miss new booking requests
5. **Handle expired bookings** - If a booking expires, it reflects poorly on response time
