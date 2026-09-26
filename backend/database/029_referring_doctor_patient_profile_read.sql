-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 029: referring doctor reads their patients'
-- profile names
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-028).
--
-- Found while migrating ReferringDoctorPortal.tsx's "My referred patients"
-- section off the mock store onto the real appointments/profiles tables
-- (frontend/lib/hooks/useAppointments.ts, useProfiles.ts). That section
-- already reads real appointments fine — appts_referring_doctor_read
-- (schema.sql) scopes appointments to `referring_doctor_id = auth.uid()` —
-- but resolving each appointment's patient_id to a display name via
-- profiles had no matching policy: profiles_select_own_or_staff
-- (schema.sql) only lets a caller read their own row or, if staff
-- (is_staff()), any row. referring_doctor is deliberately not staff (see
-- 010_reception_role.sql's comment on why reception is staff-tier but nobody
-- else non-clinical is), so every referring doctor's own patients rendered
-- as "Unknown patient" under real RLS even though the underlying
-- appointment — including the referral document itself — was already
-- fully visible to them.
--
-- This adds exactly the same relationship appts_referring_doctor_read
-- already trusts: a referring doctor may read the profile of a patient on
-- any appointment where they are the appointment's referring_doctor_id.
-- Nothing broader — this doctor still can't browse patients they aren't
-- referring, doesn't gain write access, and other roles are unaffected
-- (RLS SELECT policies are OR'd together, so this is purely additive).
-- ============================================================================

drop policy if exists "profiles_referring_doctor_read_patients" on public.profiles;
create policy "profiles_referring_doctor_read_patients" on public.profiles
  for select using (
    exists (
      select 1 from public.appointments a
      where a.patient_id = profiles.id and a.referring_doctor_id = auth.uid()
    )
  );

-- ============================================================================
-- END OF MIGRATION 029
-- ============================================================================
