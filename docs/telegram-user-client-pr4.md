# PR4: AI-generated Telegram message drafts, explicit manual approval

## Scope

This is an admin-only step after PR3. A dedicated OpenAI Responses API call
writes a single editable message. **No Telegram history, contacts or sessions
are passed to the AI provider. No AI tools, Telegram API calls, actions, or
automated sends can be initiated from draft generation.**

Flow:
1. With the selected pilot user's personal Telegram already connected, open
   the admin panel's "ИИ-помощник: подготовить сообщение" section.
2. Enter a description of what to say (up to 2500 characters) and a tone.
3. Press "Составить черновик с ИИ". The result is displayed in an editable area.
4. Review and edit the text, then press "Использовать текст для отправки".
   This only **copies text into the PR3 manual-send input**; it does not send.
5. Choose "Избранное" or an individual @username, use PR3 "Проверить получателя
   и текст", review recipient display name/Telegram ID/exact body, then
   separately press "Подтверждаю, отправить".

Editing the PR3 message invalidates any earlier send confirmation ticket.

## Configuration

In Timeweb application environment, after merging and deploying PR4, set:

`TELEGRAM_USER_AI_DRAFT_ENABLED=true`

The underlying `TELEGRAM_USER_CLIENT_ENABLED=true` and
`TELEGRAM_USER_SEND_ENABLED=true` are still mandatory; permission on the
specific user and a live encrypted session are also checked server-side.

Uses the *existing* `OPENAI_API_KEY` and `OPENAI_PROXY_*` settings. Optional
`OPENAI_MODEL_TELEGRAM_DRAFT` controls the model; default is `gpt-6-luna`.
No BotFather or Telegram secrets need to change.

## Security and privacy

- This feature sends the **admin-entered instruction** to OpenAI, not
  Telegram chats, previous messages, user session or recipient username.
  Avoid putting passwords, private chat transcripts and other secrets into
  that instruction.
- Responses API uses `store:false`, no tools, no prior conversation context.
- The server refuses if any kill switch, pilot permission or login binding
  has been revoked.
- Up to 6 generation requests/hour per selected pilot user per process. The
  rate counter resets on restart; it's for a limited admin pilot, not a
  distributed production quota.
- Each draft has a length cap of 1000 characters and 4096 bytes, matching
  the existing PR3 manual send. No silent truncation.
- Drafts are transient UI state and are never saved as Telegram message
  content in Planировыч's audit or application logs.
- OpenAI usage is recorded as `telegram_user_draft` in the existing
  metering shadow ledger. **This pilot currently does not deduct credits
  from the selected user's balance**; it still costs provider tokens.
- No background AI send, chat-reading, contact-searching, bulk outreach,
  auto-acceptance, retries of Telegram sends or scheduled operations.

## Smoke checks

1. Leave `TELEGRAM_USER_AI_DRAFT_ENABLED` off, verify the button is disabled.
2. Enable it, request a friendly draft; check text appears and can be edited.
3. Apply the draft to manual compose, confirm Telegram is NOT sent yet.
4. Send to "Избранное" via the old two-stage preview and explicit approval.
5. Change manual text after preview and verify approval disappears.
6. Disconnect user or disable pilot/sending/draft flag, verify generation
   fails closed; no Telegram messages or contact data appear in logs.
