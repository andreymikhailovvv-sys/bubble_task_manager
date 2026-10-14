# Telegram user-client PR 2: closed QR-login prototype

## Scope
Adds only account authorization for a user whose Telegram identity was already linked using the existing Telegram bot. No outgoing messages, no AI access, no contacts or chat history retrieval.

## Flow
1. Administrator selects a registered, bot-linked user in the existing admin UI and enables the pilot.
2. Timeweb environment has `TELEGRAM_USER_CLIENT_ENABLED=true`, `TELEGRAM_USER_API_ID`, `TELEGRAM_USER_API_HASH` and independent 32-byte hex `TELEGRAM_USER_SESSION_KEY`.
3. Administrator clicks "Connect Telegram via QR." A Telegram MTProto user-client login is started on the backend; a QR token is displayed only via the admin-password-gated POST endpoint with Cache-Control: no-store.
4. The user must personally scan and accept the QR using Telegram > Settings > Devices > Link Desktop Device. Telegram handles token rotation every ~30 seconds; the UI polls progress.
5. When Telegram asks for a 2FA password the user enters it once; the password is never stored or written to logs. A maximum of three submissions is allowed per attempt.
6. After successful Telegram authorization the backend compares its actual Telegram ID to the already bot-linked Telegram ID. A mismatch is not saved and the just-created session is remotely logged out.
7. The MTProto session is encrypted using AES-256-GCM (PR 1) and stored in `TelegramUserClientConnection`. No session material appears in admin responses.
8. "Disconnect" first deletes the local credential, then attempts remote Telegram logout. If remote logout cannot be confirmed, the UI instructs revoking this device in Telegram > Settings > Devices. Disabling the pilot also triggers this revocation path.

## Operational limits and security
- One active login attempt per user, maximum five concurrent across process, three-minute TTL, global and per-user allowlisting. Canceled/expired attempts should abort and disconnect.
- This prototype deliberately stores login attempts only in the running Timeweb Node.js process. If it restarts, retry from a new QR. For horizontally scaled deployments, implement durable ownership/sticky routing before public rollout; otherwise a status call to another instance cannot see the attempt.
- **Never enable on Render webhook relay.** MTProto runs only on the primary Timeweb application. Existing Bot API relay and its token are unaffected.
- Do not supply Telegram data, messages or users to OpenAI. Read/access to dialogs, contacts, groups and chat contents has not been implemented, and must not be added as part of the QR login.
- No generic MTProto client capability should be exported as a model tool; user-client code belongs to a server-only module.
- Granting admin pilot permission alone cannot sign a Telegram user in; Telegram independently requires QR approval, optionally 2FA, and identity match against the prior bot link.
- Use a dedicated Telegram API app at https://my.telegram.org/apps; do not reuse Bot API credentials or commit app secrets.
- Do not rotate `TELEGRAM_USER_SESSION_KEY` casually. Rotation invalidates previous MTProto session ciphertext until a dedicated re-encryption migration exists.
- Telegram API Terms and Content Licensing Terms restrict use of Telegram-derived data by AI: https://core.telegram.org/api/terms

## Validation
- Confirm build-check on GitHub passes.
- Confirm pre-existing Bot API notifications, Mini App and normal AI chat still work.
- Confirm no QR generated if global flag or per-user pilot is off.
- Confirm the UI rejects users without an existing Telegram bot link.
- Scan QR with *another* Telegram account. Must **not** connect or preserve session.
- Scan QR with the correct account. Confirm connected state persists after server restart.
- For accounts with Telegram 2FA enabled, verify password entry and redacted errors.
- Refresh or cancel QR; confirm an expired/canceled attempt cannot attach.
- Disconnect. Confirm local state cleared, remote logout is attempted and the admin UI reports if it did not succeed.
- Test only with a disposable/test Telegram account before authorizing the primary account.

## No new Prisma migration
All required fields were added by PR 1; the current PR adds npm dependencies and admin connection logic.

## Troubleshooting (MTProto HTTP CONNECT hotfix)

A Timeweb server may be unable to connect directly to Telegram DCs.
For example: `149.154.167.51:443/TCPFull timed out after 10s`.
The Bot API proxy is **not automatically applied** to teleproto.
The follow-up hotfix supplies a CONNECT tunnel for teleproto's raw TCP
using the existing `TELEGRAM_PROXY_URL` and optional
`TELEGRAM_PROXY_USERNAME`/`TELEGRAM_PROXY_PASSWORD`. A dedicated
`TELEGRAM_USER_PROXY_URL` can override the shared proxy URL.

After deploying the fix, click "Connect Telegram via QR" again.
The QR should be returned through the same Timeweb service, using the
existing proxy to Telegram. If the proxy rejects raw TCP tunnels to
Telegram IP:443 (HTTP status 403/407/etc.), a separate proxy permitting
CONNECT to Telegram DC IPs is needed. Never fall back silently to direct
MTProto when a proxy is configured.

The login failure logger records only phase and a safe category, never
QR tokens, application hashes, 2FA passwords, raw proxy URLs or sessions.
