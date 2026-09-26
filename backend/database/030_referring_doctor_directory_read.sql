-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 030: any authenticated user can read
-- referring-doctor profiles (public doctor directory for booking)
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-029).
--
-- Found while migrating PatientDashboard.tsx's booking form off the mock
-- store onto the real profiles table (frontend/lib/hooks/useProfiles.ts).
-- The "Referring doctor" picker needs the full list of role='referring_doctor'
-- profiles so a patient can select theirs — but profiles_select_own_or_staff
-- (schema.sql) only lets a caller read their own row or, if staff, any row;
-- a patient is never staff, so under real RLS the picker's list was always
-- empty (silently — no error, just nothing to choose), even though nothing
-- about a doctor's name/practice is sensitive information from a patient
-- booking an appointment with them.
--
-- Scoped narrowly to just the role, same shape as the already-public
-- scan_prices/content_pages/prep_instructions policies
-- (011_cms_content.sql) that any authenticated user can already read:
-- this does not open up patient or staff profiles, does not grant write
-- access, and other roles are unaffected (RLS SELECT policies are OR'd
-- together, so this is purely additive).
-- ============================================================================

drop policy if exists "profiles_read_referring_doctor_directory" on public.profiles;
create policy "profiles_read_referring_doctor_directory" on public.profiles
  for select using (role = 'referring_doctor' and auth.uid() is not null);

-- ============================================================================
-- END OF MIGRATION 030
-- ============================================================================
