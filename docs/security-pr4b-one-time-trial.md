# Security stage 4b: one-time trial and error reporting in quick AI chat

- New registered password accounts (website, Telegram web and Telegram bot) get **100 bonus AI credits once**, recorded in `aiTrialGrantedAt` in the same transaction. New Google accounts get the same.
- A verified guest can be upgraded in-place, **preserving its tasks and notes**. Backend checks JWT user ID and signed device-cookie ID together. Conditional update with null trial marker prevents a duplicate award for simultaneous registration.
- Migration marks all existing registered accounts as already credited **without changing any existing balances**. New Prisma credit defaults are zero.
- Legacy guest included credits are dropped only during the optional guest upgrade; preserved bonus/purchased credits remain available and an explicit new 100 bonus is granted. Legacy guests remain at effective zero until registering.
- Free accounts stop receiving a new 100 included credits on *future monthly rollover*. Current free-user balances are not touched during migration; paid plan monthly included behavior remains.
- Guests see a registration offer when tapping the wallet on site and Mini App web runtime.
- Compact quick AI now displays an error message *in the same conversation*, including when credits are insufficient. Expanded chat behavior remains, Mini App quick chat also displays the error.

## Smoke tests
1. New incognito guest: zero credit wallet, click wallet opens registration.
2. Create a task and note before registration; register with login and password; the same task/note remain and balance is exactly 100.
3. Login, log out, login again, reload: no extra trial grant.
4. Existing account login: previous balance remains. Existing subscription and wallet purchases unaffected.
5. Quick AI prompt by guest: inline insufficient credits message, not silence. Expanded general AI still displays failure.
6. Telegram bot registration/new Google signup: exactly 100 one-time credits.
7. Simultaneous duplicate register attempts: only one trial award, other returns a conflict.
8. At future monthly rollover free users get no free repeat trial.

## Deployment
Requires a **Prisma migration** `20261012150000_one_time_ai_trial` before new server is started. Use existing deployment migrations. No new environment variables. Do not roll back the database schema without preserving account-level trial grant markers.
