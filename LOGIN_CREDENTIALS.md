# Capital Radiology Login Credentials

These are the test accounts defined by `database/003_seed_test_accounts.sql`.

| Role | Username | Email | Password |
| --- | --- | --- | --- |
| Patient | `patient1` | `patient1@cr.test` | Set in Supabase Auth |
| Patient | `patient2` | `patient2@cr.test` | Set in Supabase Auth |
| Technician | `tech1` | `tech1@cr.test` | Set in Supabase Auth |
| Technician | `tech2` | `tech2@cr.test` | Set in Supabase Auth |
| Radiologist | `rad1` | `rad1@cr.test` | Set in Supabase Auth |
| Radiologist | `rad2` | `rad2@cr.test` | Set in Supabase Auth |
| Admin | `admin1` | `admin1@cr.test` | Set in Supabase Auth |
| Admin | `admin2` | `admin2@cr.test` | Set in Supabase Auth |
| Referring doctor | `doc1` | `doc1@cr.test` | Set in Supabase Auth |
| Referring doctor | `doc2` | `doc2@cr.test` | Set in Supabase Auth |

## Setup

1. In Supabase, open **Authentication > Users > Add user**.
2. Create each email above and assign a password.
3. Run `database/002_usernames.sql`, then `database/003_seed_test_accounts.sql` in the Supabase SQL Editor.
4. Sign in with either the email or username and the password assigned in Supabase.

Passwords are not stored in this repository. The migration only assigns profile roles and usernames to accounts that already exist in Supabase Auth.

For local demo mode, the app can also be run with `npm run dev`; use the in-app role switcher instead of these Supabase credentials.
