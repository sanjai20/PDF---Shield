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

## Security Protocols and Controls

This project is designed as a security-focused PDF processing platform rather than a generic file utility. The main protection layers already implemented are:

### 1. Authentication and Session Security

- JWT-based authentication for user sessions
- password hashing with `pbkdf2_sha256`
- bearer-token protected user, jobs, and admin endpoints
- admin access enforcement through explicit admin identity checks

### 2. Document Protection Protocols

- PDF encryption using `pikepdf` with modern PDF encryption settings
- owner/user password protection support
- fine-grained permission control for print, extract, modify, annotations, forms, and assembly
- decrypt flow validation that rejects files that are not actually encrypted

### 3. Upload and Input Validation

- strict file-type validation for PDF and ZIP uploads
- maximum upload size enforcement
- maximum PDF page-count enforcement
- ZIP archive entry-count limits
- ZIP uncompressed-size checks
- unsafe ZIP path blocking to reduce archive abuse risk

### 4. Threat Detection and Content Scanning

- suspicious upload blocking for risky content patterns before processing
- PDF scanner checks for:
  - JavaScript
  - embedded files
  - external links
  - form fields
  - metadata exposure
  - digital signature fields
- suspicious text markers and structured risk reporting

### 5. Privacy and Data Hygiene Controls

- metadata stripping for privacy-sensitive documents
- smart redaction for common PII patterns such as email, phone, SSN, card-like numbers, URLs, and custom regex
- steganography support for controlled hidden-message workflows

### 6. Abuse Prevention and SaaS Controls

- request rate limiting
- auth-specific tighter rate limiting
- plan-based usage limits
- suspicious upload rejection
- audit logging for auth, job lifecycle, admin actions, and billing-related events

### 7. Job and Artifact Security

- async job tracking with authenticated access
- artifact download restricted to the owning user
- retention-based cleanup for stored outputs
- no public direct file exposure outside authenticated endpoints

### 8. Billing and Operational Security Foundation

- billing routes isolated under authenticated APIs
- webhook verification layer prepared for provider-side signed events
- admin observability for users, jobs, failures, and plan changes

## Why This Project Stands Out

Compared to a normal PDF utility, PDF Shield combines document protection with platform-level controls:

- secure authentication and role-aware access
- async processing and downloadable job artifacts
- admin audit visibility
- threat-aware upload validation
- scanner-driven document risk review
- SaaS usage enforcement and billing foundation

That makes it closer to a secure document platform than a simple converter or compressor tool.

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

The application stores completed job outputs on disk for authenticated later download:

- artifacts are stored under the configured job storage directory
- cleanup runs based on retention settings
- artifact download is mediated through authenticated job endpoints

Current active protections include:

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
