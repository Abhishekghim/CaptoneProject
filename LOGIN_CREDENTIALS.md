# Capital Radiology Login Credentials

Test accounts in the live Supabase project. Sign in with either the username or email, and the password.

⚠️ **This file now contains real (test-only) passwords.** These are throwaway QA accounts, not real patient data, but treat this file the same way you'd treat any other credential file — don't make this repo public without rotating or scrubbing it first.

| Role | Username | Email | Password |
| --- | --- | --- | --- |
| Patient | `patient1` | `patient1@cr-demo.com` | `TestPass123!` |
| Patient | `patient2` | `patient2@cr-demo.com` | `TestPass123!` |
| Technician | `tech1` | `tech1@cr-demo.com` | `TestPass123!` |
| Technician | `tech2` | `tech2@cr-demo.com` | `TestPass123!` |
| Radiologist | `rad1` | `rad1@cr-demo.com` | `TestPass123!` |
| Radiologist | `rad2` | `rad2@cr-demo.com` | `TestPass123!` |
| Admin | `admin1` | `admin1@cr-demo.com` | `TestPass123!` |
| Admin | `admin2` | `admin2@cr-demo.com` | `TestPass123!` |
| Super admin | `superadmin1` | `superadmin1@cr-demo.com` | `TestPass123!` |
| Referring doctor | `doc1` | `doc1@cr-demo.com` | `TestPass123!` |
| Referring doctor | `doc2` | `doc2@cr-demo.com` | `TestPass123!` |
| Reception | `reception1` | `reception1@cr.test` | `TestPass123!` |

Note the domain split: the first 11 accounts were provisioned under `@cr-demo.com` back on 2026-09-01; `reception1` was added later directly under `@cr.test`. Usernames work for login regardless of the underlying email, so this mismatch doesn't affect day-to-day use — it's just a historical quirk, not a bug.

## Adding a new test account

1. In Supabase, open **Authentication → Users → Add user** (check "Auto Confirm User" to skip email verification).
2. Run `backend/database/003_seed_test_accounts.sql` in the SQL Editor to assign its role/username (it's idempotent — safe to re-run any time; it only touches `public.profiles`, never creates the auth account itself).
3. Add a row to the table above with whatever password you set.

## Dev/test-only phone verification bypass

If `PHONE_VERIFICATION_TEST_MODE=true` and `NEXT_PUBLIC_PHONE_VERIFICATION_TEST_MODE=true` are set in `.env.local`, the inline phone-verification step (shown when a patient confirms their first MRI booking) accepts any 6-digit code instead of a real SMS OTP. Leave both unset in a real deployment.

For local demo mode, the app can also be run with `npm run dev`; use the in-app role switcher (admin/super_admin only) instead of these Supabase credentials to preview other roles' dashboards.
