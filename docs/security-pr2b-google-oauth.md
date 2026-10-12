# Security stage 2b: Google OAuth identity and clearer registration errors

## Scope

- Google users are identified only by verified OAuth **Google subject** (`googleSub`); email is *never* used to silently link another account.
- Login with an existing `googleSub` preserves the existing user ID, tasks and purchases. If Google reports a new verified email that is already assigned to another user, retain the account's previous email rather than linking to the other user.
- First-time Google login requires a verified email. If that email belongs to an existing password/Telegram/other account, fail safely and display a non-destructive message asking the user to use their original sign-in method. **No automatic merging of accounts.**
- Start of OAuth creates an unpredictable state, saved as a short-lived HttpOnly Lax cookie (callback path). The callback validates matching state and a maximum age of 10 minutes. State is deleted immediately after the callback, including on rejection.
- No database schema changes, no authentication/session secret rotation, no changes to the Telegram bot, payments or Android implementation.
- Website sign-up now shows the exact API validation error instead of always saying "login may be taken". Password policy stays exactly as before: **minimum 6 characters**, including all-digit passwords. Both website and Telegram registration forms show the actual requirement.

## Deployment and environment

- Existing `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` must remain configured for Google login. No new env variables.
- Production `GOOGLE_CALLBACK_URL` must point to `https://planirovych.ru/api/auth/google/callback` (or the actual intended HTTPS host), and the Google OAuth console must allow exactly that URL.
- `NODE_ENV=production` makes the state cookie Secure. HTTPS is required. An incorrect callback domain/protocol will prevent state cookies reaching the callback.
- Google account owners who previously signed in and have `googleSub` already set will not need to relink.
- Users who previously set an email in their password account but never linked Google cannot automatically link by just owning the Google email. A separate explicit, authenticated and verified linking flow could be added later.

## Smoke test after merge

1. Existing Google account: sign in with Google, confirm **same tasks**, user ID, subscriptions and purchases.
2. New Google account with unique verified email: creates an account and can sign in again to that same account.
3. New Google account with email already present on a different existing user: no account takeover/merge. On website show "This email is already in use" and use the original login method.
4. Open `/api/auth/google/callback` directly or without a valid `state`: redirect with session error, **no login**.
5. Password-account sign-up with a six-digit password and available username: succeeds. Five-digit password: show accurate "6 characters" validation. Existing username: show the actual "login taken" error. Repeat using Telegram registration.
6. Ordinary login, Telegram Mini App/bot, admin, AI credits, tasks, downloads and billing remain unaffected.

**Risk:** Google OAuth state now requires round-trip cookie across the Google redirect; HTTPS / reverse proxy / callback host configuration must be correct. Any provider account with a colliding email and no previously recorded Google sub will stop being automatically merged. This is deliberate to close account takeover risk.

## Rollback

Revert the PR if any legitimate Google flow breaks. Existing password/Telegram sessions, tasks and database are not changed by this PR. Reverting also restores the insecure automatic Google-by-email linking, so do not leave rollback deployed longer than needed.
