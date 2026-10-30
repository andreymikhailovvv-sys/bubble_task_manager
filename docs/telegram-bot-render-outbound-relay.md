# Outbound Telegram Bot API through Render

The Telegram Bot webhook is already delivered **Telegram -> Render -> Timeweb**.
If Timeweb's provider cannot connect to `api.telegram.org:443`, this feature
routes outgoing Bot API calls **Timeweb -> Render -> Telegram**. It is opt-in,
disabled by default, and does not affect the personal MTProto assistant.

## Deployment configuration

**Render** (existing `bubble-task-manager` service, connected to Telegram):
- `TELEGRAM_BOT_API_RELAY_ENABLED=true`
- `TELEGRAM_BOT_API_RELAY_SECRET=<a random shared secret of 32-256 A-Za-z0-9_- chars>`
- `TELEGRAM_BOT_API_RELAY_BOT_TOKEN=<the main Planirovych bot token copied from Timeweb's TELEGRAM_BOT_TOKEN>`
- Keep Render's existing `TELEGRAM_BOT_TOKEN` **unchanged** if it belongs to a different or legacy Telegram bot. The outgoing relay **never** uses it.
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

1. Merge and deploy to **Render first**, enable the outbound relay environment
   variables (including `TELEGRAM_BOT_API_RELAY_BOT_TOKEN`), and wait for a healthy service. An unauthenticated direct request
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
- Receiver constructs fixed `https://api.telegram.org` URLs using the **dedicated
  Timeweb bot token**, never from request input or Render's legacy bot token.
- Missing or invalid dedicated token causes a 503 response (no fallback to another bot).
- This extra token is used only for outgoing API calls; it does not register a
  Telegram webhook or enable a second scheduler. If two deployments independently
  run notification workers using shared data, those workers must still be managed
  separately to avoid duplicate sends.
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
