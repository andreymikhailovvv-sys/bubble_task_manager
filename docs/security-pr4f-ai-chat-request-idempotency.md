# Security stage 4f: AI chat request replay prevention

## Findings
Main general AI chat POST /api/ai-chat covers web, Mini App, compact quick AI requests, and expanded projects. It previously created a new server `requestId` for **every** HTTP retry; a repeated POST could independently invoke OpenAI tools, mutate workspace, and charge twice. The credit reservation ledger from PR #950 prevents repeating **the same refund**, not duplicating the entire AI operation.

## New behavior
- The web and Mini App clients now send a **UUID clientRequestId** for each newly submitted user message, covering compact and expanded chat. Older clients without this field retain legacy behavior for compatibility.
- The server claims `(userId, clientRequestId)` via a unique database index **before** all AI/billing/tool calls and **before** streaming headers.
- It keeps only SHA-256 of the request payload (no prompt or attachment data). Reusing an ID with a changed payload yields HTTP 409.
- A concurrent duplicate receives HTTP 409/NDJSON error and **never starts** another AI operation.
- On successful execution, the public result is cached up to 512 KiB, and an identical retry receives it without additional charges, mutations or provider calls. For very large outputs, replay is rejected with a clear message.
- A previous FAILED / unfinished PROCESSING execution is **not transparently retried**. An interrupted execution may have charged or modified tasks: blindly launching it again would duplicate effects. The original request row persists across process restart; user can inspect chat and intentionally submit a distinct new request.
- Failures are marked FAILED; if the process dies before finalization, PROCESSING remains as evidence and duplicate attempts are blocked.
- No changes to credit prices, trial grants, task chat routes, OpenAI model selection, or document generation.

## Rollout and limitations
This PR scopes request idempotency to **/api/ai-chat**, because task-specific chat has a separate persistence and streaming lifecycle. Task chat, bot AI flows, and orphaned reservation recovery need separate scoped PRs. Do not auto-refund abandoned reservations by age: prior actions can have completed, and some fixed-cost reservations intentionally have no settle step.

## Deployment
One new Prisma table, automatically deployed with the existing server startup migration. No new secrets or ENV.

## Manual tests
1. Web quick AI and expanded AI chat both respond normally; Mini App AI chat does too.
2. A new message works as normal, including generated documents and tools.
3. Replaying an identical POST body with the same clientRequestId returns the cached result, without another wallet debit.
4. Two parallel requests with the same user ID and clientRequestId produce one job; the other gets 409 before spending.
5. Reusing a request UUID with different content gets 409.
6. Revisit the site after deployment: old chat history and balances remain.
