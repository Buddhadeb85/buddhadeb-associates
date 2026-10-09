# Parivar Rakshak Backend (Multi-user API)

Zero-dependency Node.js server (built-in `http` + `crypto` only).

## Start

```bash
cd parivar-backend
node server.js
# → http://localhost:3847
```

## Roles

| Role | Capabilities |
|------|----------------|
| **user** | Family profile, members, assessments, documents, advisor consent |
| **advisor** | Client list, consent-gated snapshots, notes, appointments |

## Auth

```bash
# Register family user
curl -X POST http://localhost:3847/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sunil Verma","email":"sunil@example.com","password":"test1234","mobile":"9876543210"}'

# Register advisor
curl -X POST http://localhost:3847/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Advisor","email":"advisor@example.com","password":"advisor1","role":"advisor"}'

# Login → returns JWT
curl -X POST http://localhost:3847/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"sunil@example.com","password":"test1234"}'
```

Use header: `Authorization: Bearer <token>`

## Key endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login |
| GET | `/api/family` | Family + members + consent |
| POST | `/api/family/assessment` | Save resilience score |
| PUT | `/api/family/consent` | `{ "granted": true }` |
| GET/POST | `/api/family/documents` | Document vault metadata (client encrypts payloads) |
| GET | `/api/advisor/clients` | Linked clients (scores only if consented) |
| GET | `/api/advisor/clients/:familyId` | Full snapshot if consented |
| POST | `/api/advisor/notes` | Advisor notes |
| POST | `/api/advisor/appointments` | Appointments |

## Data

Stored in `data/db.json`. For production, replace with PostgreSQL while keeping the same API.

## Frontend bridge

Include `api-client.js` in the HTML app:

```html
<script src="http://localhost:3847/api-client.js"></script>
<!-- or copy api-client.js next to the HTML -->
<script>
  // window.ParivarAPI.login(...).then(...)
</script>
```

## Security notes

- Passwords: scrypt
- Tokens: HMAC-SHA256 JWT-like, 7-day expiry
- Advisors never see scores without explicit family consent
- Document payloads are optional client-side encrypted blobs — server stores opaque ciphertext only
- Set `JWT_SECRET` env var in production
