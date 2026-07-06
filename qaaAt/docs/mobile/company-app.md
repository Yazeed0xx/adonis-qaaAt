# Company App API Handoff

This document is for the frontend team or agent responsible for the company-facing app.

It reflects the backend contract implemented in the codebase as of `2026-05-20`, with emphasis on approval-state handling, multipart registration, and the current response envelopes.

## Scope

The company app owns:

- company registration and login
- approval-state awareness
- hall management
- booking management for owned halls
- company notifications

Base URL:

- local: `http://localhost:3333`
- API root: `http://localhost:3333/api`

Auth header for protected routes:

```http
Authorization: Bearer <token>
```

## Response Contract Summary

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

Errors use a top-level `error` object.

Validation example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "registrationNumberPdf",
        "message": "The registrationNumberPdf field must be a file",
        "rule": "file"
      }
    ]
  }
}
```

Domain/auth example:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized access"
  }
}
```

Do not depend on legacy shapes such as `errors: [...]`.

## Key Migration Notes

These are the places most likely to break an older company frontend integration:

1. Auth responses now place payloads under `data`.
2. Company registration must be sent as `multipart/form-data`.
3. Error parsing must use `error.code` and `error.message`.
4. Protected company business flows can fail with approval-state errors even when login succeeds.
5. Hall and booking list/detail endpoints return transformed resources, but company auth returns the raw `company` model payload from Lucid.

## Approval State Rules

The company lifecycle currently includes:

- `pending`
- `approved`
- `rejected`
- `suspended`

Important frontend rule:

- always branch on `data.company.status`
- never rely only on the success message text

Only `approved` companies can:

- create/update/delete halls
- view and manage booking requests

Example protected-route failures:

Pending:

```json
{
  "error": {
    "code": "COMPANY_PENDING_APPROVAL",
    "message": "Your company is pending admin approval. You cannot perform this action yet."
  }
}
```

Rejected:

```json
{
  "error": {
    "code": "COMPANY_REJECTED",
    "message": "Your company registration was rejected. Please contact support for more information."
  }
}
```

Suspended:

```json
{
  "error": {
    "code": "COMPANY_SUSPENDED",
    "message": "Your company account has been suspended. Please contact support."
  }
}
```

## Endpoint Reference

### POST `/api/companies/register`

Creates a company account and returns a token immediately, but the company starts in `pending` status.

Content type:

- `multipart/form-data`

Required form-data fields:

- `email`
- `password`
- `companyName`
- `registrationNumber`
- `registrationNumberPdf` as a PDF file
- `businessAddress`
- `city`

Optional fields:

- `taxId`
- `businessLicense`
- `contactPerson`
- `description`
- `logo`
- `banner`
- `website`
- `socialLinks`

React Native / Expo notes:

- do not set the `Content-Type` header manually
- let the client build the multipart boundary
- `registrationNumberPdf` must include `uri`, `name`, and `type`

Recommended `socialLinks` behavior:

- send as a serialized JSON string when using multipart clients

Example:

```js
const formData = new FormData()
formData.append('email', 'company@example.com')
formData.append('password', 'password123')
formData.append('companyName', 'Royal Events Co.')
formData.append('registrationNumber', 'CR-1234567890')
formData.append('businessAddress', '123 King Fahd Road')
formData.append('city', 'Riyadh')
formData.append('registrationNumberPdf', {
  uri: selectedFile.uri,
  name: 'cr-document.pdf',
  type: 'application/pdf',
})
formData.append('socialLinks', JSON.stringify({ instagram: '@royalevents' }))
```

Success `201`:

```json
{
  "message": "Company registered successfully. Your account is pending admin approval.",
  "data": {
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
      "token": "..."
    }
  }
}
```

Frontend notes:

- token path is `data.token.token`
- registration response uses a compact company object
- this response does not include the full company profile

### POST `/api/companies/login`

Request body:

```json
{
  "email": "company@example.com",
  "password": "password123"
}
```

Success `200`:

```json
{
  "message": "Login successful. Your company is pending admin approval.",
  "data": {
    "user": {
      "id": 2,
      "email": "company@example.com",
      "userType": "company"
    },
    "company": {
      "id": 1,
      "taxId": "300123456789",
      "registrationNumber": "CR-1234567890",
      "registrationNumberPdf": "cr_documents/uuid.pdf",
      "businessLicense": null,
      "contactPerson": "Ahmed Al-Salem",
      "businessAddress": "123 King Fahd Road",
      "city": "Riyadh",
      "userId": 2,
      "createdAt": "2026-05-20T10:00:00.000+00:00",
      "updatedAt": "2026-05-20T10:00:00.000+00:00",
      "deletedAt": null,
      "status": "pending",
      "approvedAt": null,
      "approvedBy": null,
      "rejectionReason": null,
      "rejectedAt": null,
      "companyProfile": {
        "id": 1,
        "companyName": "Royal Events Co.",
        "description": "Premium event organizers",
        "logo": null,
        "banner": null,
        "website": null,
        "socialLinks": {
          "instagram": "@royalevents"
        }
      }
    },
    "token": {
      "type": "bearer",
      "token": "..."
    }
  }
}
```

Frontend notes:

- login success message changes based on approval status
- the real status source of truth is `data.company.status`
- this endpoint returns a broader raw company object than transformed hall/booking resources do

Possible success messages:

- `Login successful`
- `Login successful. Your company is pending admin approval.`
- `Login successful. Your company registration was rejected.`
- `Login successful. Your company account is suspended.`

### GET `/api/companies/me`

Protected.

Success `200`:

```json
{
  "data": {
    "user": {
      "id": 2,
      "email": "company@example.com",
      "userType": "company"
    },
    "company": {
      "id": 1,
      "taxId": "300123456789",
      "registrationNumber": "CR-1234567890",
      "registrationNumberPdf": "cr_documents/uuid.pdf",
      "businessLicense": null,
      "contactPerson": "Ahmed Al-Salem",
      "businessAddress": "123 King Fahd Road",
      "city": "Riyadh",
      "userId": 2,
      "createdAt": "2026-05-20T10:00:00.000+00:00",
      "updatedAt": "2026-05-20T10:00:00.000+00:00",
      "deletedAt": null,
      "status": "approved",
      "approvedAt": "2026-05-20T12:00:00.000+00:00",
      "approvedBy": 1,
      "rejectionReason": null,
      "rejectedAt": null,
      "companyProfile": {
        "id": 1,
        "companyName": "Royal Events Co.",
        "description": "Premium event organizers",
        "logo": null,
        "banner": null,
        "website": null,
        "socialLinks": {
          "instagram": "@royalevents"
        }
      }
    }
  }
}
```

Frontend notes:

- use this endpoint to refresh current approval state after login
- because `company` is returned from the model, expect admin/ops fields to be present here

### POST `/api/companies/logout`

Protected.

Success `200`:

```json
{
  "message": "Logged out successfully"
}
```

## Hall Management APIs

All hall management routes require:

- authenticated company user
- approved company

### Hall Resource Shape

Hall endpoints use the transformer-based hall resource:

```json
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
```

### GET `/api/companies/halls`

Optional query params:

- `page`
- `limit`

Success `200`:

- shape is `{ data: Hall[], meta: PaginationMeta }`

### GET `/api/companies/halls/:id`

Success `200`:

- shape is `{ data: Hall }`

### POST `/api/companies/halls`

Request body:

```json
{
  "name": "Royal Grand Hall",
  "description": "Large luxury event hall",
  "capacity": 500,
  "location": "Al Olaya District",
  "amenities": {
    "parking": true,
    "wifi": true
  },
  "pricing": 5000,
  "images": ["https://example.com/hall.jpg"],
  "address": "123 King Fahd Road",
  "city": "Riyadh",
  "services": ["coffee", "parking"],
  "isAvailable": true
}
```

Rules:

- `name`: required
- `capacity`: required, minimum 1
- `location`: required
- `pricing`: required, minimum 0
- `address`: required
- `city`: required
- other fields optional

Success `201`:

```json
{
  "message": "Hall created successfully",
  "data": {
    "id": 1,
    "name": "Royal Grand Hall",
    "pricing": 5000
  }
}
```

Frontend notes:

- the actual returned object is the full hall resource, not only the fields shown above
- `pricing` is a number in the response

### PUT `/api/companies/halls/:id`

Partial update is supported.

Success `200`:

```json
{
  "message": "Hall updated successfully",
  "data": {
    "id": 1,
    "name": "Royal Grand Hall"
  }
}
```

### DELETE `/api/companies/halls/:id`

Success `200`:

```json
{
  "message": "Hall deleted successfully"
}
```

## Booking Management APIs

All booking management routes require:

- authenticated company user
- approved company

### Booking Resource Shape

Booking endpoints use the transformer-based booking resource:

```json
{
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
  "user": {
    "id": 5,
    "userName": "Mohammed Ahmed",
    "email": "mohammed@example.com",
    "userType": "user",
    "createdAt": "2026-05-20T10:00:00.000+00:00",
    "updatedAt": "2026-05-20T10:00:00.000+00:00",
    "isEmailVerified": true,
    "userProfile": {
      "id": 7,
      "firstName": "Mohammed",
      "lastName": "Ahmed",
      "phone": "+966501234567",
      "address": "Riyadh",
      "avatar": null
    }
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
```

Frontend note:

- nested `user` in booking responses uses transformed fields like `isEmailVerified` and `userProfile`
- this differs from `/api/users/me`, which returns `emailVerified` and `profile`

### GET `/api/companies/bookings`

Optional query params:

- `page`
- `limit`
- `status`

Success `200`:

- shape is `{ data: Booking[], meta: PaginationMeta }`

### GET `/api/companies/bookings/pending`

Optional query params:

- `page`
- `limit`

Success `200`:

- shape is `{ data: Booking[], meta: PaginationMeta }`

### GET `/api/companies/bookings/:id`

Success `200`:

- shape is `{ data: Booking }`

### POST `/api/companies/bookings/:id/accept`

Success `200`:

```json
{
  "message": "Booking accepted successfully. The customer will be notified to proceed with payment.",
  "data": {
    "id": 10,
    "status": "accepted",
    "paymentStatus": "unpaid"
  }
}
```

### POST `/api/companies/bookings/:id/reject`

Request body:

```json
{
  "reason": "The hall is unavailable on this date"
}
```

Rules:

- `reason` is required
- min length 10
- max length 500

Success `200`:

```json
{
  "message": "Booking rejected. The customer will be notified.",
  "data": {
    "id": 10,
    "status": "rejected",
    "rejectionReason": "The hall is unavailable on this date"
  }
}
```

## Company Notification APIs

All notification routes require an authenticated company user.

### GET `/api/companies/notifications`

Optional query params:

- `page`
- `limit`
- `unread_only`

Success `200`:

- shape is `{ data: Notification[], meta: PaginationMeta }`

Notification item shape:

```json
{
  "id": 1,
  "type": "booking_created",
  "title": "New booking request",
  "message": "A customer submitted a booking request.",
  "data": {
    "bookingId": 10
  },
  "readAt": null,
  "createdAt": "2026-05-20T10:00:00.000+00:00",
  "isRead": false
}
```

### GET `/api/companies/notifications/unread-count`

Success `200`:

```json
{
  "data": {
    "unreadCount": 2
  }
}
```

### POST `/api/companies/notifications/:id/read`

Success `200`:

```json
{
  "message": "Notification marked as read",
  "data": {
    "id": 1,
    "isRead": true
  }
}
```

### POST `/api/companies/notifications/read-all`

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

The company app should normalize responses using this order:

1. if `response.error` exists, handle it as failure
2. otherwise use `response.data` as the payload when present
3. use `response.meta` for pagination
4. use `response.message` for toasts and workflow banners

Suggested shape:

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

## Final Notes For The Company App Agent

When reorganizing API calls, treat these rules as the practical contract:

1. auth payloads live under `data`
2. approval state lives under `data.company.status`
3. hall and booking screens should read `data` and `meta`
4. notification unread filter must be sent as `unread_only`
5. registration must remain multipart

If the frontend currently assumes one uniform `company` shape across auth, hall, and booking endpoints, it should be refactored to handle endpoint-specific resource types.
