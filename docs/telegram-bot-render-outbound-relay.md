# Outbound Telegram Bot API through Render

The Telegram Bot webhook is already delivered **Telegram -> Render -> Timeweb**.
If Timeweb's provider cannot connect to `api.telegram.org:443`, this feature
routes outgoing Bot API calls **Timeweb -> Render -> Telegram**. It is opt-in,
disabled by default, and does not affect the personal MTProto assistant.

## Deployment configuration

**Render** (existing `bubble-task-manager` service, connected to Telegram):
- `TELEGRAM_BOT_API_RELAY_ENABLED=true`
- `TELEGRAM_BOT_API_RELAY_SECRET=<a random shared secret of 32-256 A-Za-z0-9_- chars>`
- `TELEGRAM_BOT_API_RELAY_BOT_TOKEN` is required and holds the main bot token from Timeweb (reuse the variable previously created).
- Keep Render's existing `TELEGRAM_BOT_TOKEN` **unchanged** if it belongs to a different or legacy Telegram bot. The outgoing relay **never** uses it.
- Do not delete the dedicated token variable. Render's unrelated legacy bot token must remain unchanged.
- Keep current incoming webhook vars `TELEGRAM_RELAY_ENABLED`,
  `TELEGRAM_RELAY_SOURCE_SECRET`, `TELEGRAM_RELAY_TARGET_SECRET`,
  `TELEGRAM_RELAY_TARGET_URL` unchanged.
- **Do not set** `TELEGRAM_BOT_API_RELAY_URL` on Render.

**Timeweb** (main application):
- `TELEGRAM_BOT_API_RELAY_URL=https://bubble-task-manager.onrender.com/api/telegram-bot-api-relay`
- `TELEGRAM_BOT_API_RELAY_SECRET=<exactly the same value as on Render>`
- Keep `TELEGRAM_BOT_TOKEN`, incoming `TELEGRAM_WEBHOOK_SECRET`,
  OpenAI proxy and MTProto proxy variables unchanged.
- `TELEGRAM_PROXY_URL` is ignored for Bot API calls while the relay URL is set.
  Do not change it until after successful verification.

Generate a unique secret locally with:
```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## Rollout order

**Important:** Deploy this commit to both **Render and Timeweb**, Render first,
Timeweb second. The new Render relay rejects bot tokens in the request body.
The Timeweb sender no longer includes one. Use the already existing dedicated
token variable on Render; no new keys are required.

1. Merge and deploy to **Render first**, keeping the existing `TELEGRAM_BOT_API_RELAY_ENABLED=true` and `TELEGRAM_BOT_API_RELAY_SECRET` values, then wait for a healthy service. An unauthenticated direct request
   to `/api/telegram-bot-api-relay` must return **401**, not 200.
2. Deploy the same code to **Timeweb** while leaving the outgoing relay URL
   unset. Existing bot routing remains unchanged.
3. Set both outbound relay variables on **Timeweb** and restart its application.
4. Send `/start` to the bot, then a short text. Verify bot responses.
5. Test a voice message (requires `getFile` + a binary file download);
   verify notifications and any photo broadcast feature.
6. Check for logs `[TelegramBotApiRelay] completed` on Render. The source
   service must no longer log `Telegram SOCKS5 connect rejected` for Bot API.

If a step fails, **unset the two new vars on Timeweb** (and restart) to
restore the previous route. This will not fix the existing proxy block, but
provides a clean rollback without touching incoming webhooks. Do not disable
the incoming webhook relay.

## Security / behavior

- Separate high-entropy shared secret, checked in constant time.
- Receiver rejects all unauthenticated calls; disabled by default.
- The caller never sends its bot token to Render. The receiver uses its dedicated `TELEGRAM_BOT_API_RELAY_BOT_TOKEN` environment variable for outgoing Telegram requests.
- Receiver returns **400** when the request contains a bot token, **401** for unauthorized callers, and **503** with a specific reason if the shared secret or dedicated bot token is missing/invalid. No fallback to another bot.
- No additional outgoing bot process or scheduler is launched. If two
  deployments independently run notification workers using shared data, those
  workers must still be managed separately to avoid duplicate sends.
- Only `sendMessage`, `sendPhoto`, `editMessageText`,
  `editMessageReplyMarkup`, `answerCallbackQuery`, `getFile`,
  and narrowly validated file download paths are accepted.
- Supports JSON, the existing `sendPhoto` multipart upload, and binary files
  for voice and attachments.
- Preserves Telegram's actual upstream HTTP status and body, including errors.
- No fallback to Timeweb's blocked proxy if relay fails, to avoid duplicate
  sends and unintended operations. Note: the existing queue may still re-run
  a complete AI request after a failed final delivery; that is a separate
  idempotency issue and should be addressed in a future fix.
- Do not log the shared secret, the Telegram token or message contents.

## Ingress diagnostics

On Render startup, two read-only checks run once: a deliberately invalid update sent to the configured Timeweb webhook (HTTP 400 means authorized, HTTP 401 means incoming secret mismatch), and Telegram getWebhookInfo for the main bot. Check [TelegramIngressDiagnostic] logs for the registered webhook host, path type, pending updates and last error time. Neither check sends a message or changes webhook registration.

On Timeweb, [TelegramWebhook] logs whether the incoming header is missing or mismatched, without exposing its value. [TelegramBotApiRelay] on Render distinguishes missing and invalid secrets/token values via an explicit reason. Outgoing notifications alone do not prove the incoming webhook works.
