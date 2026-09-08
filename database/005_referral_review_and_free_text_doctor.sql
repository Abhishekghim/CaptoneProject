-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 005: Free-text referring doctor + technician
-- referral review
-- Run in Supabase SQL Editor AFTER database/schema.sql (and 002/004 if used).
--
-- Real-world nuance (see conversation with the project owner): a patient
-- almost never has their doctor's registration number or professional
-- email, so requiring that to name a doctor at booking doesn't reflect how
-- referrals actually work. A patient can always name their doctor by name
-- and practice, and attach the referral document itself as the actual
-- proof — the same thing they'd hand a receptionist in person. If that
-- doctor already has an account, referring_doctor_id links to it as before;
-- if not, referring_doctor_name/practice capture it as plain text, with no
-- separate onboarding step required for the appointment to proceed.
--
-- Separately: a technician reviewing the referral against the requested
-- scan (right body part, signed, clinically appropriate) is a normal part
-- of their pre-scan check in real practice — referral_reviewed captures
-- that as a lightweight acknowledgment, not a gate on booking or scanning.
-- ============================================================================

alter table public.appointments add column if not exists referring_doctor_name text;
alter table public.appointments add column if not exists referring_doctor_practice text;
alter table public.appointments add column if not exists referral_reviewed boolean not null default false;
alter table public.appointments add column if not exists referral_reviewed_by uuid references public.profiles (id) on delete set null;
alter table public.appointments add column if not exists referral_reviewed_at timestamptz;

do $$ begin
  alter table public.appointments add constraint referral_review_fields_consistent check (
    (referral_reviewed = false and referral_reviewed_by is null and referral_reviewed_at is null)
    or (referral_reviewed = true and referral_reviewed_by is not null and referral_reviewed_at is not null)
  );
exception when duplicate_object then null; end $$;

-- A row should never claim both a linked account AND free-text doctor
-- details at once — one or the other, matching the app's own logic in
-- lib/store.tsx (bookAppointment only ever sets one side).
do $$ begin
  alter table public.appointments add constraint referring_doctor_link_xor_freetext check (
    referring_doctor_id is null or (referring_doctor_name is null and referring_doctor_practice is null)
  );
exception when duplicate_object then null; end $$;

-- No RLS changes needed: appts_patient_cancel_own (schema.sql) already lets
-- staff (is_staff(), which includes technician) update any appointment row,
-- which covers writing referral_reviewed/_by/_at.

-- ============================================================================
-- END OF MIGRATION 005
-- ============================================================================
