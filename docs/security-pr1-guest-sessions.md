# Security rollout: PR 1 — signed guest device identity

## Scope and compatibility

Only the server's guest-account recovery mechanism changes. Web UI, Telegram auth, paid billing, database schema and the Android app code remain unchanged.

- An authenticated request with a valid `btm_auth` JWT keeps using the existing user ID and tasks.
- `GET /api/auth/me` silently upgrades legacy guest sessions with a valid JWT: the pre-existing device ID is signed into a `btm_device` cookie. The JWT and database rows are not replaced.
- When no valid JWT is present, **only an HMAC-signed `btm_device`** may restore a guest account. Unsigned cookies and IP/User-Agent fingerprints are no longer trusted. An unknown or tampered cookie creates a new isolated guest user.
- The signed device cookie still lasts 180 days; the existing auth JWT lasts 30 days.
- A former guest with an expired JWT and only a legacy unsigned device cookie **cannot be safely recovered automatically**. This is an intentional security trade-off. Existing users with valid JWTs are migrated on their next `/api/auth/me` call.
- No data is deleted, and existing guest user IDs remain in PostgreSQL. Old tasks are not reassigned to new guests.

## Production deployment checklist

1. Ensure `JWT_SECRET` is configured on the production host **before** merging. It already must be present for current JWT login. Use a high-entropy, randomly generated secret (e.g. `openssl rand -hex 32`) stored only in the platform secret manager. **Do not change a working JWT secret during this PR:** rotation invalidates active JWTs and signed device cookies and needs a separately planned rollout.
2. Check the production host's `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `JWT_SECRET` values against the tracked historical `server/.env`; investigate/rotate any actual exposed credentials independently. Removing `.env` from the current tree does not remove it from Git history. Do not paste secret values into tickets, chat or PR comments.
3. The already-existing `.gitignore` includes `server/.env`. This PR removes that tracked file. The template remains in `server/.env.example`; on deployment, production env vars remain managed by the host.
4. Production must set `NODE_ENV=production` to ensure cookie `Secure`; verify HTTPS and proxy configuration. No new environment variables, database migrations, or frontend settings are introduced here.
5. Confirm backups of production PostgreSQL exist before deployment.

## Manual smoke tests after merge

- Existing logged-in account: refresh, restart browser, create/update/delete a test task, verify the same user and data remain.
- Existing guest with a valid `btm_auth`: refresh once, check that `btm_device` is upgraded to signed `v1....` and tasks remain; close/reopen the browser and verify recovery.
- New guest using a private window: initial `/api/auth/me` creates an isolated user; refresh, revisit, and ensure their new task remains visible.
- Two isolated browsers behind the same public IP with identical user agents: their new guest user IDs and tasks remain different.
- In a disposable test account, delete only `btm_auth`, preserving signed `btm_device`; `/api/auth/me` must recover the same guest. Do not run this on a paid or important account.
- With a dummy test browser, replace `btm_device` with an unsigned legacy value and remove auth JWT; `/api/auth/me` must create a new guest, not restore someone else's account.
- Web login/register, logout, Google login, Telegram Mini App and bot, AI chat, payment history and document downloads should still work. No visual changes are expected.

## Rollback

Revert the PR if needed. Existing `btm_auth` JWT sessions will still work when the original `JWT_SECRET` is retained. The old code cannot interpret the new signed device cookie as a trusted legacy ID, so guest recovery after JWT expiry may behave differently on rollback. Do not rotate JWT during this PR. Do not merge without reviewing the CI result and smoke tests.
