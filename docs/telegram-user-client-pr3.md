# Telegram MTProto PR3: manual send pilot

## Security and scope

Only the existing admin panel can initiate a manual outbound message. AI
workflows, Telegram bot commands, scheduled jobs and background workers
cannot call this service. Sending is **off by default** even after QR login.

Set `TELEGRAM_USER_SEND_ENABLED=true` **in Timeweb application server
environment** to opt into this beta. Both that flag and
`TELEGRAM_USER_CLIENT_ENABLED=true` are mandatory, as is an individual
`pilotEnabled` permission and a valid encrypted Telegram session matched
to the Telegram account already linked to Planировыч's bot.

The UI offers (1) `Избранное` (Saved Messages), (2) a single personal
recipient identified by a strict public `@username`. No numeric IDs,
contact scanning, group or channel posting, attachments, batch sends,
forwarding, AI dispatch or automatic retries. Bot recipients are refused.

## Two-step flow

1. Enter a recipient and text in the administrator panel.
2. Click **Проверить получателя и текст** to resolve the Telegram account
   and receive a 90-second process-local, single-user preview ticket.
3. Review the resolved recipient name **and numeric ID** and the full text.
4. Click **Подтверждаю, отправить**. The confirmation token, not the
   client-provided text or username, authorizes the send. The server
   immediately consumes the token (no replays).
5. Server checks global switch, user pilot, authenticated session and
   Telegram sender account again; checks that username still resolves to
   the same person; claims an audit record; sends one literal message
   with link previews off; updates audit outcome.

A new preview invalidates the old one; restart invalidates all outstanding
previews. Delivery errors after the network send begins are reported
`UNKNOWN` and must be checked in Telegram manually. Never retry
automatically because the remote message may have been delivered.

## Rate limiting and audit

The server uses a persistent database audit. At most 3 attempts in 10
minutes, 12 attempts in 24 hours, and a 20-second gap. Every confirmed
attempt claims a unique row in a serializable transaction before calling
Telegram; duplicate tokens cannot send again, even across replicas.
The audit contains a random attempt ID, Planировыч user ID, recipient
kind/Telegram numeric ID, result (`PENDING`, `SENT`, `FAILED`,
`UNKNOWN`) and timestamps. The message body, Telegram session, QR
tokens and 2FA secrets are **never** recorded in the audit or logs.
Pending results after a crash should be treated as unknown.

## Test checklist

- Keep `TELEGRAM_USER_SEND_ENABLED` unset and confirm UI blocks sends.
- Set the flag to `true` and deploy. In admin, choose a pilot user with
  connected personal Telegram.
- Preview "Избранное", check recipient and exact body, explicitly confirm.
  Check that precisely one message appears in Saved Messages.
- Preview `@username`, inspect resolved name **and Telegram numeric ID**,
  confirm manually. A changed username / recipient must be rejected.
- Re-click confirmation, send rapid repeats, revoke pilot, disconnect
  Telegram, switch off global flag: all fail closed.
- Check that audit shows metadata and status only, never message text.
- If result says unknown, verify in Telegram before initiating any new send.

## Limitations

Preview tickets are process-local. A load-balanced deployment needs
sticky routing or a dedicated distributed preview store to avoid lost
confirmations. This release is only a single-instance/admin pilot.
No background AI action has permission to send.
