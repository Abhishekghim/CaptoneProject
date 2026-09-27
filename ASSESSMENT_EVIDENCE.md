# Assessment Evidence and Test Plan

This document maps the project to the supplied assessment criteria and separates automated evidence from checks that still require a configured Supabase project or browser-based validation. Record the date, environment, and actual result when completing a manual test. Do not record patient data, passwords, API keys, or other secrets in screenshots or submissions.

## Criterion 1: Functionality and environment

The project is a Next.js App Router application with role-specific dashboards, API handlers, Supabase authentication, PostgreSQL schema/migrations, and RLS policies. The dashboard routes are under `app/(app)/dashboard/`; database setup is under `backend/database/`; the local development command is `npm run dev`.

| Acceptance check | Evidence / expected result | Status |
| --- | --- | --- |
| Install and start the project | `npm ci`, then `npm run dev`; application opens at `http://localhost:3000` when Supabase environment values are configured | Production build passed; development server started at `http://localhost:3050`; homepage returned HTTP 200 |
| Sign-in and role access | Test valid and invalid sign-in, logout, direct URL access, and unauthenticated redirects for each role | **Verified 2026-09-27** against the live Supabase project (test accounts in `LOGIN_CREDENTIALS.md`). Unauthenticated `/dashboard` access correctly redirects to `/login`. All 7 roles (patient, technician, radiologist, admin, super_admin, referring_doctor, reception) log in successfully and land on their dashboard with zero browser console errors. |
| Main role workflows | Patient booking/results; reception schedule/patient registration; technician queue/scan logging; radiologist report workflow; referring-doctor referrals; admin and super-admin management | Routes/components exist and were exercised interactively throughout development (patient booking with referral/insurance gating, technician scan logging with real DICOM upload, radiologist report finalization, reception walk-in check-in, admin/super-admin privilege separation). Re-run the full click-through once more immediately before presenting and capture screenshots, since ad hoc dev-session testing isn't retained as committed evidence. |
| Database integration | Confirm reads/writes persist, foreign keys and constraints apply, and restricted roles cannot access another role's records | Schema and RLS are present; core flows (booking, scan logging, reporting) persist through Supabase Postgres, confirmed via the live smoke test above and prior manual testing during development. A dedicated cross-role RLS-denial test (e.g., patient A querying patient B's records directly) has not been scripted — recommended before submission. |

## Criterion 2: Understandability and maintainability

The repository uses a separated `app/`, `frontend/`, `backend/`, and `shared/` structure, TypeScript with strict checking, named domain types, focused utility modules, and CI checks. SQL migrations and security-sensitive server helpers document important constraints. Comments are used selectively; the whole codebase is not fully commented, so maintainability should be judged by structure, naming, tests, and targeted explanations rather than comment volume alone.

## Criterion 3: Test evidence

Automated checks re-run locally on 2026-09-27 (after the homepage/3D-anatomy-section changes):

| Check | Result |
| --- | --- |
| `npm run lint` | Passed; no ESLint warnings or errors |
| `npx tsc --noEmit` | Passed |
| `npm test` | Passed; 6 test files and 28 tests |
| `npm run build` | Passed; Next.js compiled and generated 49 static pages |
| W3C Nu HTML Checker (`validator.w3.org/nu`) | Ran against the live `/`, `/login`, `/signup`, `/privacy`, `/terms` pages. Found and fixed one real spec violation (a decorative `<span>`/wrapper `<div>` as direct children of an `<ol>` in the homepage "How it works" section — only `<li>` is a valid direct child). All 5 pages now validate with **0 errors**. |

The automated tests are unit/component tests and do not establish that a live Supabase project, payment provider, email provider, or external phone-verification configuration works. Add further manual outcomes below after testing; include sanitized screenshots or logs in the assessment submission as appropriate.

| Manual test | Expected result | Actual result / date |
| --- | --- | --- |
| Authentication and role-based access | Signed-out users are blocked from protected pages; each signed-in role sees only permitted workflows | **Verified 2026-09-27.** Signed-out `/dashboard` redirects to `/login`. All 7 roles log in and reach their dashboard with 0 console errors (see Criterion 1 table above for detail). |
| Patient appointment booking | Valid booking persists; a conflicting slot is rejected; referral and safety information follow the configured workflow | Exercised during development (self-referred vs. referral-required booking-review gate, no-double-booking constraint). Re-verify and screenshot immediately before presenting. |
| Staff scan-to-report lifecycle | Authorized staff record a scan; radiologist finalizes a report with required signature; patient sees only released results | Exercised during development, including real DICOM upload/parsing and the referral-review gate blocking "Start scan" until reviewed. Re-verify and screenshot immediately before presenting. |
| Billing and receipt | Payment state and receipt match the test transaction; no real card data is stored by the application | Exercised during development (Stripe Checkout test mode, admin "Send invoice"). Re-verify and screenshot immediately before presenting. |
| Admin actions and audit trail | Authorized changes persist and sensitive actions are attributable in the audit log | `audit_logs` table and `write_audit()` triggers exist and are wired to the core mutation tables. Not re-screenshotted today — recommended before submission. |
| Database access controls | Test allowed and denied operations for each role using separate test accounts; verify RLS denies cross-patient access | RLS policies are present on all patient-data tables. A scripted denial test (patient A querying patient B's row and expecting empty/denied) has not been run — recommended before submission if time allows. |

## Criterion 4: Non-functional, ethical, and privacy checks

The codebase includes RLS, server-side authorization helpers, audit logging, private-storage policies, account-deletion workflows, and a privacy page. These controls are design and implementation evidence, not proof of a deployed system's compliance or security. Use synthetic data only during assessment.

| Validation | How to verify | Status |
| --- | --- | --- |
| HTML and accessibility | Validate representative public and authenticated pages with the W3C Nu HTML Checker; run keyboard-only and screen-reader checks; log issues and fixes | **Run 2026-09-27**: `/`, `/login`, `/signup`, `/privacy`, `/terms` validated with 0 errors (1 real issue found and fixed — see Criterion 3). Authenticated dashboard pages were not run through the validator yet (harder to script without a session cookie) — recommended before submission. Keyboard-only/screen-reader pass not yet done. |
| Privacy and authorization | Verify least-privilege access and RLS denial across roles; inspect that sensitive values are not exposed in client bundles, logs, or screenshots | Code present (RLS on every patient-data table, `SUPABASE_SERVICE_ROLE_KEY` never exposed client-side — confirmed no `NEXT_PUBLIC_` prefix); deployment-level denial test not run. |
| Secrets and test accounts | Keep `.env.local` and test passwords private; rotate test accounts before publication; verify server-only keys are not prefixed with `NEXT_PUBLIC_` | `LOGIN_CREDENTIALS.md` already carries a private-file warning. Rotate/scrub test passwords before making the repo public. |
| Acceptance criteria | Complete the Criterion 1 and 3 workflow cases and attach sanitized outcomes | Authentication/role-access and HTML validation now have dated, verified evidence (above). Deep per-workflow re-screenshots (booking, scan-to-report, billing) still recommended before submission. |

## Criterion 5: Implementation and user documentation

`README.md` documents prerequisites, local setup, environment configuration, project layout, role workflows, and automated checks — this is solid **implementation/operator** documentation. `.env.local.example` describes optional integrations and test-mode cautions. `LOGIN_CREDENTIALS.md` documents how to provision and use test accounts.

Gap: the rubric also asks for **end-user help documentation** (a patient learning how to book a scan, a technician learning the scan-logging flow, etc.), which is thinner. The public homepage now has a patient-facing FAQ section (referrals, Medicare/insurance, what to bring, implant safety, results timing), but there is no in-app help/guide for staff roles (reception, technician, radiologist, admin). Recommended before submission: a short per-role "how to use this" page or PDF (even one page per role) to close this gap — it's a fast win relative to its rubric weight.

## Criterion 6: Individual contribution

This criterion is assessed individually and cannot be established by repository files alone. Keep a dated contribution log identifying the tasks completed, relevant files or pull requests, tests run, and any collaboration. Be prepared to explain the design and demonstrate the work.

Git commit authorship as of 2026-09-27 (`git shortlog -sn`), for reference only — this is not a substitute for each member's own contribution log, since a lot of real work in a session like this (design decisions, testing, debugging) doesn't show up as a commit count:

| Author | Commits |
| --- | --- |
| Abhishekghim | 15 |
| himal kc | 4 |
| Abhishek Ghimirre | 1 |
| AlexDware47895179 | 1 |
| Prabin Bhandari | 1 |

Note: `Abhishekghim` and `Abhishek Ghimirre` both appear to be the same person under two local git identities — worth reconciling (`git config user.name`) before submission so the log isn't confusing to a marker. If any collaborator's real contribution (e.g. pair-programming, review, non-commit work) isn't reflected in commit counts, say so explicitly in your individual log rather than letting the marker infer it from `git shortlog`.