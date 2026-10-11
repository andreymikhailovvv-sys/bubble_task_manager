# Security stage 2a: password-route throttling

Scope: server only, without changing authentication storage, database schema, admin UI, Google OAuth logic, Telegram bot logic, cookie formats, or existing endpoints' successful responses.

## Limits per server process

| Endpoint | Limit | Window | Effect |
| --- | --- | --- | --- |
| `POST /api/auth/login` | 15 attempts per normalized login, and 300 per IP | 15 min | HTTP 429, `Retry-After` |
| `POST /api/auth/telegram-web-login` | Same shared login buckets | 15 min | HTTP 429, `Retry-After` |
| `POST /api/auth/register` | 60 requests per IP | 60 min | HTTP 429, `Retry-After` |
| `POST /api/admin/*` (existing password-protected endpoints) | 240 requests per IP | 15 min | HTTP 429 |
| Admin **incorrect/missing password** | 8 failures per IP | 15 min | HTTP 429 on the next attempt |

A successful username/password login resets the login-specific bucket. Other operations are unchanged. IP caps are intentionally generous for users sharing reverse proxies; login-account caps are more restrictive. The login cap can be triggered by attackers targeting one user, causing temporary account lockout; this is a known trade-off of account-level throttling.

Counters are process-local and bounded. They reset on deploy/restart and are **not shared** between multiple Node instances. This is an incremental stopgap. Before horizontal scaling, use a centralized Redis/DB-backed limiter, and explicitly configure trusted reverse proxy handling; never use arbitrary `X-Forwarded-For` header values as a security identity. This PR does not introduce a new environment variable or require DB migrations.

This PR also changes admin password verification to constant-time comparison of SHA-256 digests without changing the existing `ADMIN_PANEL_PASSWORD` value, request/response shape, or admin UI. This is **not** a replacement for role-based admin authorization, session revocation or MFA; those require separate design/deployment.

## Manual checks before proceeding

1. Normal site sign-in and sign-up, including validation error, should work without visual changes.
2. Telegram bot login via web flow should still work; Telegram Mini App and linked sessions stay intact.
3. Existing admin page: enter correct password, load users, view statistics, change only a test record, verify success.
4. Wrong admin password: gets 401 initially; after eight failures from one IP, the next request gets 429 and a `Retry-After` header. Use a test/staging environment for this test, not the production admin IP.
5. Invalid website password for one login: gets 401 initially; after 15 attempts gets 429 for approximately 15 minutes. Use only a disposable test account.
6. Ordinary tasks, AI chat, credit spending, payments and downloads should be unaffected. No client UI, DB schema or Android code changes.

## Known remaining work for stage 2b

- Google OAuth account linking by email must be changed to prevent unverified identity claiming and cross-account linking. The existing Google login flow is **intentionally untouched** in this PR, to avoid shipping simultaneous potentially breaking changes in multiple login providers.
- Admin role/second factor and password/session revocation remain subsequent tasks.
