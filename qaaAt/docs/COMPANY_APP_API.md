# QaaAt Company App — API Integration Guide

> Base URL: `http://localhost:3333` (development) or your production domain.
> All endpoints return JSON. Send `Content-Type: application/json` for all requests except file uploads (use `multipart/form-data`).

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

## Company Approval States

After registration, a company goes through an approval flow controlled by the admin. The company `status` field determines what the company can do:

| Status      | Can login | Can manage halls | Can manage bookings | Description                          |
|-------------|-----------|------------------|---------------------|--------------------------------------|
| `pending`   | Yes       | No               | No                  | Waiting for admin approval           |
| `approved`  | Yes       | Yes              | Yes                 | Fully operational                    |
| `rejected`  | Yes       | No               | No                  | Admin rejected registration          |
| `suspended` | Yes       | No               | No                  | Admin suspended an approved company  |

When a company with a non-approved status tries to access protected endpoints (hall CRUD, booking management), the API returns:

```json
// 403 — pending
{
  "message": "Your company is pending admin approval. You cannot perform this action yet.",
  "code": "COMPANY_PENDING_APPROVAL"
}

// 403 — rejected
{
  "message": "Your company registration was rejected. Please contact support for more information.",
  "code": "COMPANY_REJECTED",
  "reason": "Incomplete business documents"
}

// 403 — suspended
{
  "message": "Your company account has been suspended. Please contact support.",
  "code": "COMPANY_SUSPENDED"
}
```

**Frontend should:** Check `company.status` from login/me response and show the appropriate state screen.

---

## 1. Authentication

### POST `/api/companies/register`

Register a new company account. No auth required. **Uses `multipart/form-data`** because of the PDF upload.

**Request Body (multipart/form-data):**

| Field                 | Type   | Required | Notes                                |
|-----------------------|--------|----------|--------------------------------------|
| email                 | string | Yes      | Must be unique, valid email          |
| password              | string | Yes      | Min 8 characters                     |
| companyName           | string | Yes      | Display name for the company         |
| registrationNumber    | string | Yes      | Commercial registration number       |
| registrationNumberPdf | file   | Yes      | PDF file, max 10MB                   |
| businessAddress       | string | Yes      | Full business address                |
| city                  | string | Yes      | City name                            |
| taxId                 | string | No       | Tax identification number            |
| businessLicense       | string | No       | Business license number              |
| contactPerson         | string | No       | Contact person name                  |
| description           | string | No       | Company description                  |
| logo                  | string | No       | Logo URL                             |
| banner                | string | No       | Banner image URL                     |
| website               | string | No       | Company website URL                  |
| socialLinks           | object | No       | JSON object of social media links    |

**Example (FormData):**

```javascript
const formData = new FormData()
formData.append('email', 'company@example.com')
formData.append('password', 'securepass123')
formData.append('companyName', 'Royal Events Co.')
formData.append('registrationNumber', 'CR-123456789')
formData.append('registrationNumberPdf', pdfFile) // File object
formData.append('businessAddress', '123 King Fahd Road')
formData.append('city', 'Riyadh')
formData.append('taxId', 'TAX-987654')
formData.append('contactPerson', 'Ahmed Ali')
formData.append('description', 'Premium event hall provider')
```

**Success Response (201):**

```json
{
  "message": "Company registered successfully. Your account is pending admin approval.",
  "user": {
    "id": 2,
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
    "token": "oat_NTY..."
  }
}
```

**Notes:**
- Company starts with `status: "pending"` — admin must approve before the company can create halls or manage bookings.
- The token is still issued immediately so the company can login, view their profile, and receive notifications about approval status.

---

### POST `/api/companies/login`

Login with existing credentials. No auth required.

**Request Body (JSON):**

| Field    | Type   | Required |
|----------|--------|----------|
| email    | string | Yes      |
| password | string | Yes      |

**Example Request:**

```json
{
  "email": "company@example.com",
  "password": "securepass123"
}
```

**Success Response (200):**

```json
{
  "message": "Login successful. Your company is pending admin approval.",
  "user": {
    "id": 2,
    "email": "company@example.com",
    "userType": "company"
  },
  "company": {
    "id": 1,
    "userId": 2,
    "taxId": "TAX-987654",
    "registrationNumber": "CR-123456789",
    "registrationNumberPdf": "/cr_documents/abc123.pdf",
    "businessLicense": null,
    "contactPerson": "Ahmed Ali",
    "businessAddress": "123 King Fahd Road",
    "city": "Riyadh",
    "status": "pending",
    "approvedAt": null,
    "approvedBy": null,
    "rejectionReason": null,
    "rejectedAt": null,
    "createdAt": "2026-02-20T10:00:00.000+00:00",
    "updatedAt": "2026-02-20T10:00:00.000+00:00",
    "companyProfile": {
      "id": 1,
      "companyName": "Royal Events Co.",
      "description": "Premium event hall provider",
      "logo": null,
      "banner": null,
      "website": null,
      "socialLinks": null,
      "userId": 2,
      "createdAt": "2026-02-20T10:00:00.000+00:00",
      "updatedAt": "2026-02-20T10:00:00.000+00:00"
    }
  },
  "token": {
    "type": "bearer",
    "token": "oat_NTY..."
  }
}
```

**Login message varies by status:**
- `"approved"` → `"Login successful"`
- `"pending"` → `"Login successful. Your company is pending admin approval."`
- `"rejected"` → `"Login successful. Your company registration was rejected."`
- `"suspended"` → `"Login successful. Your company account is suspended."`

**Error Response (401):**

```json
{
  "message": "Invalid credentials"
}
```

---

### GET `/api/companies/me`

Get the authenticated company's full profile. **Auth required.**

**Success Response (200):**

```json
{
  "user": {
    "id": 2,
    "email": "company@example.com",
    "userType": "company"
  },
  "company": {
    "id": 1,
    "userId": 2,
    "taxId": "TAX-987654",
    "registrationNumber": "CR-123456789",
    "registrationNumberPdf": "/cr_documents/abc123.pdf",
    "businessLicense": null,
    "contactPerson": "Ahmed Ali",
    "businessAddress": "123 King Fahd Road",
    "city": "Riyadh",
    "status": "approved",
    "approvedAt": "2026-02-21T14:00:00.000+00:00",
    "approvedBy": 1,
    "rejectionReason": null,
    "rejectedAt": null,
    "createdAt": "2026-02-20T10:00:00.000+00:00",
    "updatedAt": "2026-02-21T14:00:00.000+00:00",
    "companyProfile": {
      "id": 1,
      "companyName": "Royal Events Co.",
      "description": "Premium event hall provider",
      "logo": null,
      "banner": null,
      "website": null,
      "socialLinks": null,
      "userId": 2,
      "createdAt": "2026-02-20T10:00:00.000+00:00",
      "updatedAt": "2026-02-20T10:00:00.000+00:00"
    }
  }
}
```

---

### POST `/api/companies/logout`

Revoke the current access token. **Auth required.**

**Success Response (200):**

```json
{
  "message": "Logged out successfully"
}
```

---

## 2. Hall Management

All hall management endpoints require **Auth + Company account**. Create, update, and delete additionally require **approved** company status.

### GET `/api/companies/halls`

List all halls owned by the authenticated company. **Auth required.**

**Query Parameters:**

| Param | Type   | Default | Description          |
|-------|--------|---------|----------------------|
| page  | number | 1       | Page number          |
| limit | number | 20      | Results per page (max 100) |

**Success Response (200):** Paginated list.

```json
{
  "meta": { "total": 3, "perPage": 20, "currentPage": 1, "lastPage": 1, "firstPage": 1 },
  "data": [
    {
      "id": 1,
      "name": "Grand Ballroom",
      "description": "A luxurious ballroom for weddings and events",
      "capacity": 500,
      "location": "King Fahd Road",
      "amenities": { "wifi": true, "parking": true, "stage": true },
      "pricing": 300,
      "images": ["https://example.com/img1.jpg"],
      "address": "123 King Fahd Road",
      "city": "Riyadh",
      "services": ["Photography", "Catering"],
      "isAvailable": true,
      "companyId": 1,
      "createdAt": "2026-02-15T10:00:00.000+00:00",
      "updatedAt": "2026-02-15T10:00:00.000+00:00"
    }
  ]
}
```

---

### GET `/api/companies/halls/:id`

Get a single hall with its bookings. **Auth required.** Company can only see its own halls.

**URL Params:**

| Param | Type   |
|-------|--------|
| id    | number |

**Success Response (200):**

```json
{
  "id": 1,
  "name": "Grand Ballroom",
  "description": "A luxurious ballroom for weddings and events",
  "capacity": 500,
  "location": "King Fahd Road",
  "amenities": { "wifi": true, "parking": true, "stage": true },
  "pricing": 300,
  "images": ["https://example.com/img1.jpg"],
  "address": "123 King Fahd Road",
  "city": "Riyadh",
  "services": ["Photography", "Catering"],
  "isAvailable": true,
  "companyId": 1,
  "createdAt": "2026-02-15T10:00:00.000+00:00",
  "updatedAt": "2026-02-15T10:00:00.000+00:00",
  "bookings": [
    {
      "id": 1,
      "bookingDate": "2026-03-15",
      "startTime": "14:00:00",
      "endTime": "18:00:00",
      "status": "pending",
      "totalPrice": 1200,
      "userId": 5,
      "hallId": 1,
      "createdAt": "2026-02-20T10:00:00.000+00:00"
    }
  ]
}
```

**Notes:**
- The `bookings` array includes all bookings for this hall (useful for calendar/schedule views).

---

### POST `/api/companies/halls`

Create a new hall. **Auth required + Approved company.**

**Request Body (JSON):**

| Field       | Type     | Required | Notes                              |
|-------------|----------|----------|------------------------------------|
| name        | string   | Yes      | Hall name                          |
| capacity    | number   | Yes      | Min 1                              |
| location    | string   | Yes      | Location description               |
| pricing     | number   | Yes      | Price per hour, min 0              |
| address     | string   | Yes      | Full street address                |
| city        | string   | Yes      | City name                          |
| description | string   | No       | Detailed description               |
| amenities   | object   | No       | Flexible JSON object of amenities  |
| images      | string[] | No       | Array of image URLs                |
| services    | string[] | No       | Array of service name strings      |
| isAvailable | boolean  | No       | Defaults to `true`                 |

**Example Request:**

```json
{
  "name": "Grand Ballroom",
  "description": "A luxurious ballroom perfect for weddings and corporate events",
  "capacity": 500,
  "location": "King Fahd Road, Al Olaya District",
  "amenities": {
    "wifi": true,
    "parking": true,
    "stage": true,
    "soundSystem": true,
    "projector": true
  },
  "pricing": 300,
  "images": [
    "https://example.com/hall1-main.jpg",
    "https://example.com/hall1-interior.jpg"
  ],
  "address": "123 King Fahd Road, Al Olaya",
  "city": "Riyadh",
  "services": ["Photography", "Catering", "Decoration", "Lighting"],
  "isAvailable": true
}
```

**Success Response (201):**

```json
{
  "message": "Hall created successfully",
  "hall": {
    "id": 1,
    "name": "Grand Ballroom",
    "description": "A luxurious ballroom perfect for weddings and corporate events",
    "capacity": 500,
    "location": "King Fahd Road, Al Olaya District",
    "amenities": { "wifi": true, "parking": true, "stage": true, "soundSystem": true, "projector": true },
    "pricing": 300,
    "images": ["https://example.com/hall1-main.jpg", "https://example.com/hall1-interior.jpg"],
    "address": "123 King Fahd Road, Al Olaya",
    "city": "Riyadh",
    "services": ["Photography", "Catering", "Decoration", "Lighting"],
    "isAvailable": true,
    "companyId": 1,
    "createdAt": "2026-02-20T10:00:00.000+00:00",
    "updatedAt": "2026-02-20T10:00:00.000+00:00"
  }
}
```

---

### PUT `/api/companies/halls/:id`

Update an existing hall. **Auth required + Approved company.** Company can only update its own halls.

**URL Params:**

| Param | Type   |
|-------|--------|
| id    | number |

**Request Body (JSON):** Same fields as create. All fields are sent (full replacement).

**Example Request:**

```json
{
  "name": "Grand Ballroom (Renovated)",
  "capacity": 600,
  "location": "King Fahd Road, Al Olaya District",
  "pricing": 350,
  "address": "123 King Fahd Road, Al Olaya",
  "city": "Riyadh",
  "isAvailable": true
}
```

**Success Response (200):**

```json
{
  "message": "Hall updated successfully",
  "hall": {
    "id": 1,
    "name": "Grand Ballroom (Renovated)",
    "capacity": 600,
    "pricing": 350,
    "..."
  }
}
```

---

### DELETE `/api/companies/halls/:id`

Soft-delete a hall. **Auth required + Approved company.** Company can only delete its own halls.

**URL Params:**

| Param | Type   |
|-------|--------|
| id    | number |

**No request body needed.**

**Success Response (200):**

```json
{
  "message": "Hall deleted successfully"
}
```

---

## 3. Booking Management

All booking endpoints require **Auth + Company account + Approved status**.

### GET `/api/companies/bookings`

List all bookings across all company halls. **Auth required + Approved.**

**Query Parameters:**

| Param  | Type   | Default | Description                                    |
|--------|--------|---------|------------------------------------------------|
| page   | number | 1       | Page number                                    |
| limit  | number | 20      | Results per page (max 100)                     |
| status | string | —       | Filter: `pending`, `accepted`, `rejected`, `confirmed`, `cancelled`, `completed`, `expired` |

**Example:** `GET /api/companies/bookings?status=accepted&page=1`

**Success Response (200):** Paginated list.

```json
{
  "meta": { "total": 10, "perPage": 20, "currentPage": 1, "lastPage": 1, "firstPage": 1 },
  "data": [
    {
      "id": 1,
      "bookingDate": "2026-03-15",
      "startTime": "14:00:00",
      "endTime": "18:00:00",
      "status": "pending",
      "totalPrice": 1700,
      "specialRequests": "Need extra chairs",
      "rejectionReason": null,
      "companyRespondedAt": null,
      "expiresAt": "2026-02-27T10:00:00.000+00:00",
      "paymentStatus": "unpaid",
      "paymentDueDate": null,
      "userId": 5,
      "hallId": 1,
      "createdAt": "2026-02-20T10:00:00.000+00:00",
      "updatedAt": "2026-02-20T10:00:00.000+00:00",
      "hall": {
        "id": 1,
        "name": "Grand Ballroom",
        "city": "Riyadh"
      },
      "user": {
        "id": 5,
        "userName": "Ahmed",
        "email": "ahmed@example.com",
        "userType": "user"
      },
      "services": [
        {
          "id": 1,
          "name": "Photography",
          "price": 500,
          "__pivot_price_at_booking": 500
        }
      ]
    }
  ]
}
```

---

### GET `/api/companies/bookings/pending`

List only pending bookings that need the company's response. Sorted by oldest first (most urgent). **Auth required + Approved.**

**Query Parameters:**

| Param | Type   | Default |
|-------|--------|---------|
| page  | number | 1       |
| limit | number | 20      |

**Success Response (200):** Same paginated format as above, but only includes bookings with `status: "pending"` that haven't expired yet.

**Notes:**
- Only shows bookings where `expiresAt` is still in the future.
- Sorted by `createdAt ASC` — oldest pending bookings first (most urgent to respond to).

---

### GET `/api/companies/bookings/:id`

Get a single booking's full details including user info. **Auth required + Approved.**

**URL Params:**

| Param | Type   |
|-------|--------|
| id    | number |

**Success Response (200):**

```json
{
  "id": 1,
  "bookingDate": "2026-03-15",
  "startTime": "14:00:00",
  "endTime": "18:00:00",
  "status": "pending",
  "totalPrice": 1700,
  "specialRequests": "Need extra chairs",
  "rejectionReason": null,
  "companyRespondedAt": null,
  "expiresAt": "2026-02-27T10:00:00.000+00:00",
  "paymentStatus": "unpaid",
  "paymentDueDate": null,
  "userId": 5,
  "hallId": 1,
  "createdAt": "2026-02-20T10:00:00.000+00:00",
  "updatedAt": "2026-02-20T10:00:00.000+00:00",
  "hall": {
    "id": 1,
    "name": "Grand Ballroom",
    "capacity": 500,
    "pricing": 300,
    "city": "Riyadh",
    "address": "123 King Fahd Road"
  },
  "user": {
    "id": 5,
    "userName": "Ahmed",
    "email": "ahmed@example.com",
    "userType": "user",
    "userProfile": {
      "id": 3,
      "firstName": "Ahmed",
      "lastName": "Ali",
      "phone": "+966501234567",
      "address": "Riyadh"
    }
  },
  "services": [
    {
      "id": 1,
      "name": "Photography",
      "description": "Professional event photography",
      "price": 500,
      "__pivot_price_at_booking": 500
    }
  ]
}
```

**Error Response (404):**

```json
{
  "message": "Booking not found"
}
```

---

### POST `/api/companies/bookings/:id/accept`

Accept a pending booking. The customer will be notified and given 3 days to pay. **Auth required + Approved.**

**URL Params:**

| Param | Type   |
|-------|--------|
| id    | number |

**No request body needed.**

**Success Response (200):**

```json
{
  "message": "Booking accepted successfully. The customer will be notified to proceed with payment.",
  "booking": {
    "id": 1,
    "status": "accepted",
    "paymentDueDate": "2026-02-23T10:00:00.000+00:00"
  }
}
```

**Error Responses (400):**

```json
{ "message": "Booking not found" }
{ "message": "Unauthorized: This booking does not belong to your company" }
{ "message": "Cannot accept booking with status: rejected" }
{ "message": "Cannot accept expired booking" }
```

---

### POST `/api/companies/bookings/:id/reject`

Reject a pending booking with a reason. The customer will be notified. **Auth required + Approved.**

**URL Params:**

| Param | Type   |
|-------|--------|
| id    | number |

**Request Body (JSON):**

| Field  | Type   | Required | Notes                       |
|--------|--------|----------|-----------------------------|
| reason | string | Yes      | Min 10 chars, max 500 chars |

**Example Request:**

```json
{
  "reason": "Sorry, the hall is under maintenance on that date. Please try another date."
}
```

**Success Response (200):**

```json
{
  "message": "Booking rejected. The customer will be notified.",
  "booking": {
    "id": 1,
    "status": "rejected",
    "rejectionReason": "Sorry, the hall is under maintenance on that date. Please try another date."
  }
}
```

**Error Responses (400):**

```json
{ "message": "Booking not found" }
{ "message": "Unauthorized: This booking does not belong to your company" }
{ "message": "Cannot reject booking with status: accepted" }
```

---

## 4. Notifications

### GET `/api/companies/notifications`

Get the company's notifications. **Auth required.**

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
      "id": 10,
      "userId": 2,
      "type": "new_booking_request",
      "title": "New Booking Request",
      "message": "You have a new booking request from A customer for \"Grand Ballroom\" on 2026-03-15. Please review and respond within 7 days.",
      "data": {
        "bookingId": 1,
        "hallName": "Grand Ballroom",
        "bookingDate": "2026-03-15",
        "userName": "A customer"
      },
      "readAt": null,
      "createdAt": "2026-02-20T10:00:00.000+00:00"
    },
    {
      "id": 5,
      "userId": 2,
      "type": "company_approved",
      "title": "Company Approved",
      "message": "Congratulations! Your company \"Royal Events Co.\" has been approved. You can now create halls and start receiving bookings.",
      "data": null,
      "readAt": "2026-02-21T08:00:00.000+00:00",
      "createdAt": "2026-02-21T14:00:00.000+00:00"
    }
  ]
}
```

**Notification Types (for `type` field):**

| Type                   | When it's sent                                    |
|------------------------|---------------------------------------------------|
| `company_approved`     | Admin approved the company registration            |
| `company_rejected`     | Admin rejected the company registration            |
| `new_booking_request`  | A customer submitted a new booking for a hall      |
| `booking_cancelled`    | A customer cancelled their booking                 |

**Notes:**
- `readAt` is `null` for unread notifications, a datetime string when read.
- `data` contains context: `bookingId`, `hallName`, `bookingDate`, `reason` (for rejections).
- `new_booking_request` notifications are the most important — they require a response within 7 days.

---

### GET `/api/companies/notifications/unread-count`

Get the count of unread notifications. **Auth required.** Use for badge indicators.

**Success Response (200):**

```json
{
  "unreadCount": 3
}
```

---

### POST `/api/companies/notifications/:id/read`

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
    "id": 10,
    "type": "new_booking_request",
    "title": "New Booking Request",
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

### POST `/api/companies/notifications/read-all`

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

## 5. Booking Flow Summary (Company Perspective)

This is what the company sees and does during the booking lifecycle:

```
Customer creates a booking
         │
         ▼
    ┌──────────┐
    │  pending  │ ← Company must respond within 7 days
    └─────┬────┘
          │
    ┌─────┴───────────────────┐
    │                         │
    ▼                         ▼
┌────────┐  ◄─ Company   ┌────────┐  ◄─ Company
│ accept │     action     │ reject │     action
└───┬────┘                └────────┘
    │
    ▼
┌───────────┐
│ accepted  │ ← Waiting for customer payment (3-day window)
└───────────┘
```

**Company actions:**
- **View pending** → `GET /api/companies/bookings/pending` — see what needs attention.
- **Accept** → `POST /api/companies/bookings/:id/accept` — customer gets 3 days to pay.
- **Reject** → `POST /api/companies/bookings/:id/reject` — must provide a reason (min 10 chars).
- **No response in 7 days** → booking auto-expires. Customer is notified automatically.

**Status meanings from the company perspective:**

| Status      | What it means                                       |
|-------------|-----------------------------------------------------|
| `pending`   | New request — needs company decision                 |
| `accepted`  | Company accepted — waiting for customer payment      |
| `rejected`  | Company rejected with a reason                       |
| `confirmed` | Customer paid — event is confirmed                   |
| `cancelled` | Customer cancelled the booking                       |
| `expired`   | Company didn't respond within 7 days                 |
| `completed` | Event date has passed                                |

---

## 6. HTTP Status Codes Reference

| Code | Meaning                                                    |
|------|------------------------------------------------------------|
| 200  | Success                                                    |
| 201  | Created (registration, hall creation)                      |
| 400  | Bad request (validation error, business logic error)       |
| 401  | Unauthorized (missing/invalid token, wrong credentials)    |
| 403  | Forbidden (company not approved, wrong user type)          |
| 404  | Not found                                                  |
| 422  | Validation error (field-level errors from VineJS)          |
| 500  | Server error                                               |

---

## 7. Key Implementation Notes for Frontend

### Company Status Gate

After login, **always check `company.status`** and show the appropriate screen:

```
if (company.status === "pending")   → Show "Waiting for Approval" screen
if (company.status === "rejected")  → Show "Registration Rejected" screen with company.rejectionReason
if (company.status === "suspended") → Show "Account Suspended" screen
if (company.status === "approved")  → Show main dashboard
```

Use `GET /api/companies/me` to refresh the status (e.g., on app resume / pull-to-refresh). The company will also get a push notification when their status changes.

### Dashboard Priorities

When the company is approved, the main dashboard should highlight:
1. **Pending bookings count** — from `GET /api/companies/bookings/pending` `meta.total`
2. **Unread notifications** — from `GET /api/companies/notifications/unread-count`
3. **Total halls** — from `GET /api/companies/halls` `meta.total`

### Booking Response Urgency

Show pending bookings with a **countdown timer** calculated from `expiresAt`:
- `daysLeft = expiresAt - now`
- Show in red when < 2 days remaining.
- After expiry, the booking disappears from pending and appears as `expired` in the full list.

### Notification Polling

Poll `GET /api/companies/notifications/unread-count` every 30-60 seconds for badge updates. The most important notification type is `new_booking_request` — consider highlighting these differently.

### Hall Management

- `amenities` is a flexible JSON object — the frontend can define its own key set (e.g., `wifi`, `parking`, `stage`, `soundSystem`, `kitchen`, etc.) and render checkboxes/toggles.
- `images` is an array of URL strings — the frontend handles image upload to a CDN and sends the resulting URLs.
- `services` is an array of string names — simple text tags that describe what the hall offers.
- `pricing` is **per hour**. Make sure to label it clearly in the UI.
- `isAvailable` acts as a master toggle — when `false`, the hall won't appear in public search and can't receive new bookings.

### Registration File Upload

The company registration form must use `multipart/form-data` (not JSON) because of the required PDF file upload (`registrationNumberPdf`). Max file size is 10MB, only `.pdf` files accepted.

### Token Storage

Store the Bearer token securely (e.g., `SecureStore` in React Native). Send it in every authenticated request via the `Authorization: Bearer <token>` header.
