# Mobile API Integration

This folder is the authoritative handoff for the two frontend apps:

- [user-app.md](/Users/yazeed/Desktop/adonis-qaaAt/qaaAt/docs/mobile/user-app.md)
- [company-app.md](/Users/yazeed/Desktop/adonis-qaaAt/qaaAt/docs/mobile/company-app.md)

Use these docs together with the generated OpenAPI output:

- Scalar UI: `/api`
- OpenAPI JSON: `/api.json`
- OpenAPI YAML: `/api.yaml`

## Shared Rules

### Base URL

- development: `http://localhost:3333`
- production: your deployed API domain

### Authentication

Protected endpoints require:

```http
Authorization: Bearer <token>
```

### Success Envelopes

The backend uses a small set of top-level response patterns:

Single resource:

```json
{
  "data": {}
}
```

Paginated list:

```json
{
  "data": [],
  "meta": {}
}
```

Mutation with payload:

```json
{
  "message": "...",
  "data": {}
}
```

Mutation without payload:

```json
{
  "message": "..."
}
```

### Error Envelope

All documented validation, domain, and auth failures should be parsed from `error`.

Domain/auth errors:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid credentials"
  }
}
```

Validation errors:

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

Do not rely on older `errors: [...]` examples from duplicate legacy docs.

### Money Fields

These are returned as client-ready numbers:

- `pricing`
- `price`
- `totalPrice`

### Query Naming

Several filters remain snake_case in the query string even though response keys are camelCase.

Examples:

- `min_capacity`
- `max_price`
- `unread_only`

### Email Verification

User verification is OTP-based:

- registration sends a 6-digit code by email
- submit the code with `POST /api/users/verify-email`
- request a new code with `POST /api/users/resend-verification`

### Frontend Recommendation

For frontend teams or AI agents:

1. Use the two handoff docs in this folder for workflow-specific behavior.
2. Use `/api.json` as a secondary source for generated route documentation.
3. Prefer the current controller behavior over older duplicate docs under `docs/`.
4. Normalize responses by reading `error`, then `data`, then `meta`, then `message`.
