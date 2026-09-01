# Capital Radiology — Online MRI Management System (Project 24)

Full-stack blueprint: Next.js (App Router) + React + Tailwind CSS + Lucide icons on the
frontend, PostgreSQL / Supabase (Auth, RLS, Storage) on the backend.

## Quick start (demo mode — no backend needed)

```bash
npm install
npm run dev
# open http://localhost:3000
```

The app boots with seeded in-memory data and a **role switcher** in the top bar
(Patient / Technician / Radiologist / Admin), so every workflow is testable
end-to-end in the browser immediately:

1. **Patient** — book an MRI (slot clash detection, referral upload), fill the
   MRI safety checklist, view finalized reports, download a mock DICOM export,
   see billing.
2. **Technician** — start a queued scan, then log it (protocol, machine,
   duration slider, simulated DICOM upload). This releases the study to radiology.
3. **Radiologist** — pick a study from the unreported queue, read it in the
   canvas DICOM viewer (zoom / pan / brightness / contrast / invert), apply a
   report template, save a draft, then type an e-signature to finalize.
4. **Admin** — KPIs (total scans, monthly revenue, pending reports), record
   payments, service overdue equipment, and search the append-only audit log,
   which records every action taken in the session.

## Connecting Supabase (production mode)

1. Create a Supabase project and run `database/schema.sql` in the SQL Editor.
   It creates all enums, the 8 core tables, indexes, triggers (auto profile
   creation, `updated_at`, automatic audit trail), Row-Level Security policies
   for all four roles, and three private storage buckets
   (`referrals`, `dicom`, `receipts`).
2. Copy `.env.local.example` to `.env.local` and set
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. `lib/supabase.ts` exposes the client; the store's action functions map 1:1
   onto tables (`bookAppointment` → `appointments` + `billing`, `logScan` →
   `mri_scans`, `finalizeReport` → `radiology_reports`, …), so swapping the
   in-memory setters for `supabase.from(...)` calls is mechanical.

## Structure

```
database/schema.sql          Complete DDL: enums, tables, FKs, indexes, RLS, triggers, seed
app/                         App Router entry (layout, page, global styles)
lib/                         types, seed data, global store (auth simulation + actions), supabase client
components/shared/           Shell (sidebar + role switcher), UI primitives
components/patient/          Booking, health profile, results & billing
components/technician/       Queue + scan logger
components/radiologist/      Canvas DICOM viewer + report editor
components/admin/            KPIs, billing, equipment, audit log
```

## Requirement coverage

- FR1–FR5 auth & RBAC → `profiles` + RLS `get_user_role()` helpers + role switcher
- FR6–FR19 booking, profiles, referrals → PatientDashboard + `appointments`/`patient_medical_records`
- FR20–FR28 procedures & imaging → TechnicianPortal + `mri_scans` + storage `dicom` bucket
- FR29–FR33 reporting → RadiologistWorkspace + `radiology_reports` (signature CHECK constraint)
- FR34–FR38 billing → BillingPanel + `billing`
- FR44–FR48 patient portal → results/billing/appointments sections
- FR53–FR56 equipment → EquipmentPanel + `equipment_logs`
- FR52, FR70–FR74 security & audit → RLS on every table, append-only `audit_logs`, DB audit triggers
- NFR5–NFR8 → AES-256 at rest (Supabase default), HTTPS, bcrypt via Supabase Auth, fine-grained RLS
