# Work PR 1203 · AI dispatcher and corporate credit wallet

## Corporate billing and isolation
- All company assistant and monitoring calls reserve **organization** credits only; personal User wallet and the personal AI usage tables are not debited.
- A separate organization balance is stored in **millicredits**. A token-based preauthorization is calculated using the existing model pricing table and an intentionally conservative UTF-8 byte upper bound for input. The maximum response output is capped.
- Provider Responses usage determines the final debit (including cached and reasoning tokens via existing pricing). Leftover reservation is refunded atomically. Unknown/missing provider usage is held as UNKNOWN_USAGE for manual reconciliation, not refunded or silently treated as zero.
- Reservation and settlement use DB transactions and conditionally locked balance updates, preventing overspend by simultaneous requests. Operations create auditable ledger rows. In case of an interrupted provider connection after a response began, automatic refund is not assumed to avoid hidden provider costs.
- No free monthly corporate credits. Owner/ADMIN/MANAGER can request the company AI, but cannot manually top up. Only the platform's password-protected `/admin556215` can top up company credit balances.
- Administrative operations: POST /api/admin/organizations, POST /api/admin/organizations/:id/credits, POST /api/admin/organizations/:id/credit-history. Existing admin-password checks and rate limiting apply. 1–100000 **whole** credits per top-up. User balances are unchanged.

## AI and task monitoring
- Company dispatcher has its own stored messages; task conversations are isolated by organizationId and taskId.
- The provider receives only organization-owned projects, tasks, members, current task and its bounded chat history. No personal tasks/notes are read. No automatic mutation tools are given to the model; it proposes actions in text for explicit user confirmation through ordinary UI.
- Owners/admins can set company model Luna/Terra/Sol. Corporate credit balance and lifetime spend available in Work UI.
- Owner/admin/manager may enable monitoring on a task. The due time creates a persistent monitoring job. Changing a due date or completing a task cancels/revisions scheduled deadlines.
- Triggers can be manually added, viewed and cancelled in the task AI panel. Maximum 5 pending triggers, 90-day horizon.
- Automatic AI processing runs through **the existing personal monitoring worker recovery interval**, scans only pending due company jobs, and claims them using a conditional update. No loop over company tasks.
- At-most-once dispatch prevents duplicated paid requests after restart. Insufficient credits leads to a visible NO_CREDITS status; failed calls to FAILED, no silent retries.
- No emails, Telegram messages or changing task data by AI before explicit permission and a per-company integration policy.

## Known scope limit
- This PR introduces a safe first working B2B AI assistant and automatic deadline/trigger checks. AI-generated trigger creation and structured approval cards remain future enhancements; the manual trigger UI works now.
- Task-aware context is bounded to avoid enormous payloads and model costs. More granular project permissions and departmental scoping will follow in subsequent PRs.
- No public purchase flow for organizations yet, only manual admin grants.

## Deployment
- Backup the Timeweb PostgreSQL DB before merge: new Organization columns and Work AI tables are additive; personal Task, Sphere, User, credits columns are not migrated.
- Confirm an organization with zero credits cannot invoke OpenAI, but its member can browse projects normally.
- Admin grant +10 credits to Org A: verify balance in Work. A request uses Org A only; verify Org B and the user's personal balance unchanged.
- Test simultaneous requests to avoid negative balance; test a failed/empty OpenAI request refunds/holds safely.
- Task monitoring opt-in, deadline, trigger, cancellation and changing due dates. Confirm only one AI invocation and correct ledger.
- Check personal AI chats, existing monitoring worker, Mini App and Telegram flows as regression tests.
