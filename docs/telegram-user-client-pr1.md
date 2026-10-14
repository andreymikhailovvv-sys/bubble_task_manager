# Telegram user-client pilot: PR 1 (security foundation)

## Scope
- No MTProto network connection, QR login, contacts, chat read or message send in this PR.
- The existing Telegram Bot API, webhook relay (Render -> Timeweb), bot conversation table `TelegramSession`, AI chat and Mini App remain unchanged.
- The administrator can grant/revoke *eligibility* for a selected registered user in the existing admin panel using existing `ADMIN_PANEL_PASSWORD` authentication.
- This permission does not impersonate a user and does not itself authorize a Telegram account.

## Security invariants
1. Global kill switch: `TELEGRAM_USER_CLIENT_ENABLED` must be exactly `true` and the per-user `pilotEnabled` must be true for any **future** MTProto action. Default is disabled. Follow-up PRs must use `canUseTelegramUserClient` on every connection/read/send route and worker.
2. Sensitive MTProto session data uses its own nullable `TelegramUserClientConnection.encryptedSession` column, never `TelegramSession` or the bot token. A distinct `TELEGRAM_USER_SESSION_KEY` (32 random bytes as 64 hex characters) is required when storing sessions; there is **no JWT_SECRET fallback**.
3. `encryptTelegramUserSession` / `decryptTelegramUserSession`: AES-256-GCM, 96-bit random nonce, authenticated owner-bound AAD, versioned envelope. Invalid ciphertext, swapped user ID or missing key fails closed. Never return session secrets from routes, logs, metrics or AI tools.
4. Admin control invokes existing `requireAdminPassword`, with fixed-length hash comparison and rate limiting. Request bodies must not be logged. The admin API returns only pilot state and boolean connection status.
5. Disabling pilot access clears local session material and connection metadata. Once real MTProto sessions are implemented, additionally perform remote Telegram logout/revocation (including connection-drop failure handling).
6. Only the actual user may initiate and explicitly approve account linking. The admin password must **not** authorize linking a user's Telegram account on their behalf.
7. Each outgoing message requires explicit prior informed consent to recipient, exact text and timing. No autonomous bulk broadcasts, arbitrary recipient targeting, or automatic ingestion of Telegram chats into an AI prompt.
8. Telegram API terms at https://core.telegram.org/api/terms prohibit the use of Telegram-platform data for AI development/deployment, and require user knowledge and consent for actions. Before shipping any AI-backed workflow, review compliance independently and do not expose Telegram-obtained data to OpenAI.

## Deployment
- The migration `20261014130000_telegram_user_client_pilot` must run before deployment of this PR.
- `TELEGRAM_USER_CLIENT_ENABLED=false` is the safe default. No environment changes are needed to test administrator pilot toggles.
- Generate `TELEGRAM_USER_SESSION_KEY` for PR 2 with `openssl rand -hex 32`; store **only** in Timeweb server secrets, never in Git or the browser. It is intentionally not needed in PR 1.
- There is no new webhook, Telegram API credential, or background worker in PR 1.

## Acceptance checklist
- Existing admin login works; selecting a user shows a pilot toggle; enabling one user never enables another.
- Refresh and re-enter the admin password; toggle state persists in PostgreSQL.
- Disable and verify `pilotEnabled=false` and that local MTProto session fields are null.
- Wrong or missing admin password cannot modify pilot state.
- Verify the regular `/api/auth/me`, bot webhook and AI endpoints never expose the new encrypted field.
- Run `npm run build` and `npm test --workspace server`.
