# Capital Radiology

Capital Radiology is a Next.js App Router application for MRI bookings and clinic workflows. It uses Supabase Auth and PostgreSQL with Row-Level Security (RLS); several integrations (email, payments, AI assistant) require their own provider configuration.

## Run locally

Prerequisites: Node.js 20 and npm.

1. Install dependencies with `npm ci`.
2. Copy `.env.local.example` to `.env.local` and configure at least `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for authentication and protected routes.
3. Set up a Supabase project and apply the SQL schema and migrations in `backend/database/`. Check each migration's header for prerequisites and apply migrations in numeric order; do not apply a migration to an existing database without first checking its current schema.
4. Start the development server with `npm run dev`, then open `http://localhost:3000`.

Additional environment variables enable server-side features. `SUPABASE_SERVICE_ROLE_KEY` must remain server-only and bypasses RLS; never expose it in a `NEXT_PUBLIC_` variable. Email, Stripe, OpenAI, and phone-verification configuration and test-mode warnings are documented in `.env.local.example`. Do not enable the phone-verification test bypass in a deployed environment.

For test accounts, see [LOGIN_CREDENTIALS.md](LOGIN_CREDENTIALS.md). It contains test passwords: keep it private and rotate or remove those accounts before any public deployment.

## Workflows

- **Patient:** manage health information, book appointments, submit referrals, view reports and billing, message the clinic, and manage privacy settings.
- **Reception:** register patients, view the schedule, and manage arrivals.
- **Technician:** work the scan queue and record scan details.
- **Radiologist:** review scans and create, sign, and finalize reports.
- **Referring doctor:** submit referrals and view permitted patient/report information.
- **Admin:** manage appointments, billing, equipment, inventory, content, security alerts, account deletion requests, messages, and audit records.
- **Super admin:** manage staff accounts and referring-doctor access in addition to admin workflows.

Role access is enforced through Supabase Auth, server-side route checks, and database policies. Admin demo previews only change the displayed dashboard; they do not grant the previewed role's permissions.

## Medical imaging

- **DICOM viewer** (`frontend/components/radiologist/DicomViewer.tsx`, parsing in `frontend/lib/dicom/`): loads a scan's stored study, or DICOM files/folders a radiologist opens from their own computer (not uploaded). It supports uncompressed grayscale DICOM Part 10 (8/16-bit, MONOCHROME1/2, single- and multi-frame); compressed transfer syntaxes (JPEG, JPEG 2000, RLE, …) and colour images are reported per file as unsupported. It is a review viewer, not validated for primary diagnosis.
- **Series storage**: technicians upload every file of a series; `mri_scans.dicom_image_url` holds either one file path or a folder path ending in `/`. Apply `backend/database/034_dicom_series_and_annotation_images.sql` so released series folders are readable by patients/internal referrers and annotation pins are linked to the image they were placed on.
- **Homepage anatomy model**: `public/models/anatomy-bodyparts3d.glb` is derived from BodyParts3D (© The Database Center for Life Science, CC BY 4.0). See `public/models/ANATOMY_MODEL_CREDITS.txt` and `scripts/anatomy/build-anatomy-model.mjs`.

## Project layout

- `app/`: routes, layouts, authentication pages, and API handlers.
- `frontend/components/`: role-specific and shared interface components.
- `frontend/lib/`: browser Supabase client, data hooks, and frontend utilities.
- `backend/lib/`: server-side Supabase clients, authorization, and integrations.
- `backend/database/`: baseline schema and ordered SQL migrations.
- `shared/`: shared TypeScript types and domain logic.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

The CI workflow runs these same checks. The current test suite covers selected domain logic, notification handling, receipt generation, assistant data scoping, and an admin content editor; it is not a substitute for testing against a configured Supabase project. See [ASSESSMENT_EVIDENCE.md](ASSESSMENT_EVIDENCE.md) for the verification record and manual acceptance checklist.

## Contributors

- [Karambir](https://github.com/KaramVanguard)

