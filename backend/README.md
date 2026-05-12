# Backend Security Bootstrap

## First secure admin

This backend no longer creates a default admin automatically.

Before starting the server in production-like mode, seed the first admin explicitly:

1. Copy `.env.example` to `.env`
2. Set secure values for:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `ADMIN_REGISTRATION_KEY`
   - `SEED_ADMIN_NAME`
   - `SEED_ADMIN_EMAIL`
   - `SEED_ADMIN_PASSWORD`
3. Run:

```bash
npm run seed:admin
```

If an admin already exists, the command will stop safely without changing any existing admin accounts.

## Startup policy

- In normal production/internal-clinical mode, the backend refuses to start if no admin exists.
- In production-like mode, the backend now also validates the security posture of the environment before startup.
- To allow a temporary empty-admin startup in local development only, set:

```env
ALLOW_DEV_EMPTY_ADMIN_BOOTSTRAP=true
NODE_ENV=development
```

This bypass is intended only for local development and should never be enabled in production.

## Secure environment policy

- In production-like mode, startup now fails fast if the environment is insecure.
- The backend validates at least:
  - `MONGODB_URI`
  - `JWT_SECRET`
  - `JWT_REFRESH_SECRET`
  - `ADMIN_REGISTRATION_KEY`
  - `APP_BASE_URL`
  - SMTP credentials used for email-based security flows
  - MinIO credentials when object storage is enabled
- The backend rejects:
  - placeholder values such as `change_me`, `example`, `your_*`
  - identical `JWT_SECRET` and `JWT_REFRESH_SECRET`
  - `ALLOW_DEV_EMPTY_ADMIN_BOOTSTRAP=true` outside local development
  - weak default MinIO credentials such as `minioadmin`

If you are running locally with intentionally temporary values, keep:

```env
NODE_ENV=development
```

Production/internal-clinical deployments should use strong non-placeholder values everywhere.

## Notes

- Admin self-registration is disabled in the public app flows.
- Existing admin accounts are never deleted automatically at startup.
- The seed command rejects placeholder values and weak admin passwords.
- Additional admins can be created only by a logged-in admin through the secured admin workflow.

## Session security

- Access tokens are now short-lived Bearer JWTs.
- Refresh tokens are stored in a database-backed session collection and are rotated on refresh.
- Default lifetimes are controlled through:

```env
JWT_ACCESS_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your_second_strong_secret
```

- The frontend now uses:
  - `POST /api/auth/refresh` to renew sessions
  - `POST /api/auth/logout` to revoke the active session explicitly
- Revoked sessions can no longer continue to call protected routes or refresh indefinitely.

## HTTP security

- The backend now enforces `helmet` security headers and a strict CORS allowlist.
- List every browser frontend origin explicitly in:

```env
CORS_ALLOWED_ORIGINS=http://localhost:5000,http://127.0.0.1:5000,https://your-production-host
```

- Requests without an `Origin` header are still allowed for local tools, direct navigation, and server-to-server use.
- Unknown browser origins are blocked by design.

## Rate limiting

- Sensitive routes now enforce IP-based rate limiting.
- Covered flows include:
  - login
  - 2FA verification
  - forgot/reset password
  - doctor registration
  - additional admin creation
  - support ticket creation and reply
  - prediction creation and prediction update
- Limits can be tuned through the `RATE_LIMIT_*` variables in `.env`.
- When a limit is exceeded, the API returns `429` JSON with code `RATE_LIMIT_EXCEEDED`.

## Account lock protection

- In addition to IP rate limiting, repeated failed login and invalid 2FA attempts now trigger a temporary account-level lock.
- The lock duration increases progressively while failures continue and is reset after a successful authentication.
- Default tuning can be adjusted through:

```env
AUTH_LOGIN_LOCK_THRESHOLD=5
AUTH_2FA_LOCK_THRESHOLD=5
AUTH_LOCK_BASE_MS=900000
AUTH_LOCK_MAX_MS=86400000
```

- Locked accounts receive a temporary lock response until the current lock window expires.

## Upload security

- Uploaded files are validated by both MIME type and file extension before storage.
- Doctor verification documents accept only `pdf`, `png`, `jpg`, `jpeg`, and `webp` up to 5 MB.
- Support attachments accept only the explicitly approved formats up to 10 MB.
- File names are normalized before storage and before download response headers are built.
- A future malware-scan integration point is prepared through:

```env
UPLOAD_MALWARE_SCAN_MODE=disabled
```

- Keep this value as `disabled` unless a real scanner provider is implemented.

## Patient data encryption

- Patient clinical payloads are encrypted at application level with AES-256-GCM.
- Encryption config is required in production-like mode:

```env
PATIENT_DATA_ACTIVE_KEY_ID=v1
PATIENT_DATA_KEYS={"v1":"<hex_or_base64_32_bytes>","v2":"<hex_or_base64_32_bytes>"}
PATIENT_BLIND_INDEX_KEY=<hex_or_base64_32_bytes>
```

- `PATIENT_BLIND_INDEX_KEY` is used for blind index search/deduplication without exposing plaintext patient names.
- Never log keys, tokens, or plaintext patient payloads.

### Migrations and rotation

- Encrypt existing patient records:

```bash
npm run migrate:encrypt-patients
```

- Rotate active patient encryption key (progressive/idempotent):

```bash
npm run migrate:rotate-patient-key
```

- Key compromise runbook (minimum):
  - create a new key version in `PATIENT_DATA_KEYS`
  - set `PATIENT_DATA_ACTIVE_KEY_ID` to the new version
  - run `npm run migrate:rotate-patient-key`
  - revoke old key only after migration + verification complete
