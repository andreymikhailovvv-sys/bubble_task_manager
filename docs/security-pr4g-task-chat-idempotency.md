# Security 4g: task AI chat request deduplication

## Finding
The task AI route POST /api/tasks/:id/ai-chat had no durable replay protection, unlike the general AI chat in PR #954. A repeated POST could independently execute task-editing tools, charge AI credits and append dialog messages twice.

## Changes
- Reuse existing AiChatRequest ledger without migrations, new ENV or wallet changes.
- Before checking for a replay, call listTaskDialogForContext to verify current task ownership or active collaborator access. A revoked collaborator cannot retrieve cached task answers.
- Hash the incoming payload with the server-owned task ID and endpoint marker, preventing reuse of a key to replay a different task.
- Atomically claim (userId, clientRequestId) before streaming headers, model calls, document/image editing or debit. A concurrent duplicate receives HTTP 409 in JSON/NDJSON. Completed duplicate requests replay the saved result without re-running tools or writing messages.
- Mark a request SUCCEEDED only after both user and assistant task messages are written; failed requests are FAILED, interrupted operations stay PROCESSING for later audit. Do not auto-retry a partially executed task action.
- Web task chat, focus chat and Mini App task chat send the UUID of the visible user message. API client fills an ID for other callers like smart-postpone. Legacy clients without an ID retain compatibility.

## Testing
- Normal web/mini task chat, focus mode and smart postpone.
- Idempotent successful, competing and failed requests; a duplicate UUID with different task ID is rejected, and revoked task access is rechecked before replay.
- No changes to AI credit prices, schema or UI, and no Timeweb actions required.

## Next stage
Audit orphaned reservations and recovery. Some fixed-price reservations are immediately committed and must never be automatically refunded by age.
