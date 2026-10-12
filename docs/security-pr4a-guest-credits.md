# Security 4a: guest accounts cannot spend AI credits

## Behavior
- New device-only guest rows are created with **0** credits, 0 in each wallet bucket and a current period.
- Existing device-only guest rows (including legacy users with 100+ credits already stored) **display effective zero** on `/auth/me` and cannot reserve AI credits, through either fixed-price or dynamic reservation API. The monthly refresh does not grant them fresh included credits.
- Older guest wallets are **not erased**. This preserves historical and purchased-bucket records in the DB for explicit migration/account-conversion policy in subsequent PR.
- Registered users, Google identity users and Telegram-linked users retain their existing balances and monthly included refresh. This PR makes **no changes to registered user balances**, registration flow, credit pricing or purchasing/refund logic.
- `isGuest: true|false` is added to the auth response for website/Mini App UX in the next stage.

## Test cases
1. Fresh anonymous browser/device: `/auth/me` returns `isGuest: true, aiCredits:0, aiCreditsMilli:0`.
2. Revisit or reload as guest and cross month: still 0. AI action does not call provider with unpaid credit; fixed/dynamic debit both fail with insufficient credits.
3. Old device-only guest with legacy included/bonus/purchased entries: response is zero; source wallet buckets unchanged, no automatic refill; AI reservation denied.
4. Login as existing registered account: wallet and credit purchases unchanged. AI chat, fixed charges, refund and monthly refresh remain functional.
5. No schema migration; no new ENV configuration.

## Next scoped PR
Implement **one-time 100 credit trial after registration** explicitly and update wallet buttons on web and Mini App to offer registration when `isGuest`. Existing monthly included behavior for registered users is deliberately not changed in 4a, to avoid silently altering active user balances.
