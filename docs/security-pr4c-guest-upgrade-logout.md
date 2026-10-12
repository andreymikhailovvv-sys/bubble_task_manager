# Fix: logout from an account upgraded from guest

## Root cause
A freshly registered account kept the old guest `deviceId` so its tasks/notes stayed in the same row. The logout handler cleared only `btm_auth`, not `btm_device`. On the following `GET /api/auth/me`, `ensureDeviceUser` looked up that old signed device ID and **silently logged the registered account back in**. Production logs corroborated this: the same user ID was returned immediately after the primary auth cookie disappeared.

## Fix
1. `POST /auth/logout` clears **both** auth and signed device cookies, same path/options.
2. `ensureDeviceUser` can restore **only actual device-only guests**. A registered user with a leftover matching device ID is never restored by device cookie, even if an old valid cookie survives logout, gets copied, or remains after JWT expiry.
3. Registered logins/registrations clear old device cookies instead of issuing them again.
4. `GET /auth/me` refreshes missing signed device cookies only for actual guests; not for registered users converted in-place.
5. Do not delete or alter the registered account row, task ownership, credits, trial grant marker, purchases or notes.

## Verify
- Fresh incognito guest -> create task -> register -> credits = 100, task remains.
- Press **Выйти** -> login/registration buttons appear; account no longer restores on reload. Refresh browser again: still guest.
- Login with username/password -> same original task and remaining credits; logout again works.
- Old registered user logs in/out normally.
- Signed device cookie alone restores a true guest but **never** a registered account.
- Test in desktop web and Mini App web runtime if applicable.

No migration, new variables, billing changes, or JWT expiration adjustments.