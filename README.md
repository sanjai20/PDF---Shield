# PDF Shield

PDF Shield is a full-stack PDF security platform built for an India-first SaaS launch. It combines PDF protection and document hygiene tools with authentication, job history, async batch processing, admin controls, and billing foundations.

## Stack

- Backend: FastAPI, SQLAlchemy, PostgreSQL, Passlib, pikepdf, PyMuPDF
- Frontend: React, Vite
- Runtime: Docker Compose
- Billing target: Razorpay

## Current Status

Implemented and working:

- User registration, login, and JWT-based sessions
- Encrypt PDF
- Decrypt PDF with proper encrypted-file validation
- Watermark PDFs
- Remove metadata
- Smart redaction
- Permission controls
- Security scanner with structured findings
- Steganography hide/reveal
- Compression
- ZIP batch processing
- Async batch jobs with polling and artifact download
- Job history
- Admin stats, user management, and job review
- Plan-based limits
- Upload validation and suspicious content blocking
- Billing plans UI and backend foundation

Pending external integration:

- Live Razorpay account setup
- Razorpay plan ids and webhook wiring
- Final production deployment setup

## Project Structure

```text
pdf-shield/
  backend/
    services/
    config.py
    database.py
    main.py
    models.py
    requirements.txt
    schemas.py
    security.py
  frontend/
    src/
      App.jsx
  docker-compose.yml
```

## Quick Start

### Docker

```bash
docker compose up --build
```

Services:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

### Default local admin account

Create it through the API after first boot:

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"StrongPass123","full_name":"Admin"}'
```

## Main API Areas

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### PDF Tools

- `POST /api/encrypt`
- `POST /api/decrypt`
- `POST /api/watermark`
- `POST /api/remove-metadata`
- `POST /api/redact`
- `POST /api/permissions`
- `POST /api/scan`
- `POST /api/stego/hide`
- `POST /api/stego/reveal`
- `POST /api/compress`
- `POST /api/batch`
- `POST /api/batch/async`

### Jobs

- `GET /api/jobs`
- `GET /api/jobs/{job_id}`
- `GET /api/jobs/{job_id}/download`

### Admin

- `GET /api/admin/stats`
- `GET /api/admin/users`
- `PATCH /api/admin/users/{user_id}/plan`
- `GET /api/admin/jobs`

### Billing

- `GET /api/billing/plans`
- `POST /api/billing/checkout`
- `POST /api/billing/webhook`
- `POST /api/billing/portal`

Note:

- Billing is wired for Razorpay-style integration.
- `POST /api/billing/portal` currently returns a clear `501` because a self-serve customer portal is not implemented yet.

## Environment Notes

Most runtime configuration is set in `docker-compose.yml`.

Important backend settings:

- `JWT_SECRET`
- `MAX_UPLOAD_MB`
- `MAX_PDF_PAGES`
- `MAX_ZIP_ENTRIES`
- `FREE_DAILY_JOBS`
- `PRO_DAILY_JOBS`
- `BUSINESS_DAILY_JOBS`
- `FREE_BATCH_ENTRIES`
- `PRO_BATCH_ENTRIES`
- `BUSINESS_BATCH_ENTRIES`
- `ADMIN_EMAILS`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_PLAN_PRO`
- `RAZORPAY_PLAN_BUSINESS`

## Security Notes

The application now stores completed job outputs on disk for later download:

- artifacts are stored under the configured job storage directory
- cleanup runs based on retention settings
- this is different from an in-memory-only design

Current protections include:

- upload size limits
- PDF page limits
- ZIP path and uncompressed size checks
- rate limiting
- suspicious upload blocking
- plan-based usage limits
- audit logging

## Known Limitations

- Razorpay live setup is not finished until you add real dashboard keys and webhook configuration
- customer self-serve billing portal is not implemented yet
- frontend code is still concentrated in a large single `App.jsx`
- there is limited automated test coverage

## Recommended Next Steps

- finish Razorpay onboarding and webhook testing
- split frontend into smaller components
- add automated backend and frontend tests
- add production reverse proxy and HTTPS deployment
- add email notifications for async job completion

## License

MIT
