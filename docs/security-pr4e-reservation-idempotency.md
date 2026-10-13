# AI credit reservation replay hardening (security stage 4e)

## Finding
PostgreSQL `SELECT ... FOR UPDATE` on each User already serializes competing debits and prevents ordinary parallel double-spend. However, `refundAiCreditReservation()` previously trusted the in-memory breakdown without durable finalization state. A repeated refund could **mint credits twice**.

## Change
- Both exact and ranged reservations receive a random ID and are inserted into `AiCreditReservationRecord` inside the **same wallet transaction** as the debit.
- Refund/settlement acquire the same locked User row, read the saved reservation, and update the wallet plus reservation state atomically.
- Only one transition from `RESERVED` to `REFUNDED` or `SETTLED` can apply. Repeated or competing finalizations return `applied:false` and zero additional refund/charge.
- Unknown/foreign IDs cannot restore balance; the persisted debit breakdown is authoritative.
- Expired included credits cannot be refunded into a later month. Bonus and purchased credits remain refundable.
- No changes to credit prices, purchase payments, subscription settings or UI.

## Deployment
New Prisma migration `20261013103000_ai_credit_reservation_ledger` runs through existing server startup `prisma migrate deploy`. No new ENV. New table contains only new reservations; no existing user balances change.

## Operational limits
This stage prevents duplicate **finalization** of a reserved charge. It does not yet provide request-level deduplication for separate repeated AI requests, and cannot safely auto-refund all orphaned reservations: fixed-price paths debit immediately and may not later settle explicitly. Such reservations remain `RESERVED` in the ledger and must not be blindly reclaimed. Treat explicit commit for those routes and recoverable operation state as separate future PRs.

## Validation
- Two simultaneous requests cannot overdraw a balance; refunds/settlements can be retried without increasing balance twice.
- Successful dynamic text and image requests charge as before; failed requests are refunded only once.
- Trial registration, old registered balances, paid purchases unaffected.
