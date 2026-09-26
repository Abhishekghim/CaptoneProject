-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 012: patient_medical_records extended fields
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-011).
--
-- Phase 2 of moving off frontend/lib/seed.ts mock data onto real Supabase
-- persistence — Patient Profile Management (medical records) only. Adds the
-- reception-owned demographic/admin columns that already exist on the
-- MedicalRecord type in shared/types.ts (added alongside the Reception
-- Portal) but were never migrated onto the real table — until now the mock
-- store (frontend/lib/store.tsx updateRecord/registerPatient) carried them
-- in memory only. All nullable: they're optional/reception-filled, and a
-- patient self-servicing their own health profile (see PatientDashboard.tsx)
-- before reception ever registers them still needs to be able to save with
-- none of this filled in. patient_code is the one exception — still
-- nullable on the column, but always populated via the DEFAULT below on any
-- insert that doesn't explicitly provide one, matching how registerPatient
-- and the patient's own first-time save both need a code.
-- ============================================================================

alter table public.patient_medical_records add column if not exists patient_code text;
alter table public.patient_medical_records add column if not exists sex text;
alter table public.patient_medical_records add column if not exists preferred_name text;
alter table public.patient_medical_records add column if not exists address text;
alter table public.patient_medical_records add column if not exists suburb text;
alter table public.patient_medical_records add column if not exists state text;
alter table public.patient_medical_records add column if not exists postcode text;
alter table public.patient_medical_records add column if not exists medicare_number text;
-- yyyy-MM, matches the mock's string format (and MedicalRecord.medicare_expiry
-- in shared/types.ts) — not a real date type, since it's a card expiry month.
alter table public.patient_medical_records add column if not exists medicare_expiry text;

-- patient_code generator — replaces the mock's collision-prone
-- `CR-${10000 + records.length + 1}` scheme (frontend/lib/store.tsx) with a
-- real sequence, so concurrent inserts (reception registering a walk-in at
-- the same moment a different patient self-services their profile) can
-- never be assigned the same code.
create sequence if not exists public.patient_code_seq start 1;
alter table public.patient_medical_records alter column patient_code set default ('CR-' || (10000 + nextval('public.patient_code_seq'))::text);
create unique index if not exists idx_patient_medical_records_patient_code on public.patient_medical_records (patient_code) where patient_code is not null;

-- No backfill: this table starts empty in production (the mock seed data in
-- frontend/lib/seed.ts is not migrated in — only structural seed like
-- clinics/CMS content is, see 011_cms_content.sql) and fills as real
-- patients register (reception) or self-serve (health profile form), both
-- of which now rely on the DEFAULT above rather than passing patient_code
-- explicitly.

-- ============================================================================
-- END OF MIGRATION 012
-- ============================================================================
