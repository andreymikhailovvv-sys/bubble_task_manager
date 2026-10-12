# Security stage 4: Telegram webhook authentication

## Problem
The bot webhook previously allowed **all** incoming requests when `TELEGRAM_WEBHOOK_SECRET` was unset (`return true`). Anybody able to POST to the public endpoint could queue forged Telegram messages/callbacks. The relay source secret was verified, but relay could forward requests **without a target secret**.

## Changes
- Bot webhook now **fails closed**: `503` when its secret is missing/invalid, `401` on missing or incorrect secret, and only then does it validate `update_id` and enqueue.
- Exact secret comparison uses `crypto.timingSafeEqual` after type/length checks. All accepted secrets respect Telegram Bot API's `[A-Za-z0-9_-]{1,256}` format.
- An enabled relay requires **both** source and target secrets and an HTTPS target; any missing/invalid config returns `503`. Relay also compares source in constant time and always forwards its configured target secret.
- Existing durable queue `updateId @unique` and retries are untouched, so retries and duplicate Telegram deliveries remain safe.

## Required production configuration (before deploying)
1. On the server receiving `/api/telegram/webhook`, set `TELEGRAM_WEBHOOK_SECRET` to a **random 32+ character** token consisting of letters, digits, underscores, and hyphens.
2. Set the **identical** `secret_token` using Telegram Bot API `setWebhook` for the correct bot and URL. If configured token already matches the Telegram webhook, no change needed.
3. If using a forwarding service (`TELEGRAM_RELAY_ENABLED=true`), configure `TELEGRAM_RELAY_SOURCE_SECRET` equal to `secret_token` for the Telegram -> relay webhook and `TELEGRAM_RELAY_TARGET_SECRET` equal to `TELEGRAM_WEBHOOK_SECRET` at the receiving server. Keep them in provider secret settings, not Git.
4. After deployment, verify `getWebhookInfo` and send `/start` plus a harmless button command to the bot. A bad/missing secret must return `401`, absent server configuration `503`; a correct Telegram delivery gets `200`.
5. No migrations, new dependencies or changes to bot commands, mini app login, credits, or queue worker.

**Operational warning:** Deploying with an empty or mismatched secret intentionally blocks Telegram updates until configuration is corrected. Check provider environment BEFORE merging.
