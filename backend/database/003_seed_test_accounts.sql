-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 003: Assign roles/usernames to test accounts
-- Run in Supabase SQL Editor AFTER creating the 10 users below in
-- Authentication -> Users -> Add User (short emails, quick to type — see the
-- instructions Claude gave you for the exact list). This script only
-- touches public.profiles — it does not (and cannot, safely) create the
-- actual auth accounts itself. Safe to re-run.
-- ============================================================================

update public.profiles set role = 'patient', username = 'patient1', full_name = 'Patient One'
  where email = 'patient1@cr.test';
update public.profiles set role = 'patient', username = 'patient2', full_name = 'Patient Two'
  where email = 'patient2@cr.test';

update public.profiles set role = 'technician', username = 'tech1', full_name = 'Technician One'
  where email = 'tech1@cr.test';
update public.profiles set role = 'technician', username = 'tech2', full_name = 'Technician Two'
  where email = 'tech2@cr.test';

update public.profiles set role = 'radiologist', username = 'rad1', full_name = 'Radiologist One'
  where email = 'rad1@cr.test';
update public.profiles set role = 'radiologist', username = 'rad2', full_name = 'Radiologist Two'
  where email = 'rad2@cr.test';

update public.profiles set role = 'admin', username = 'admin1', full_name = 'Admin One'
  where email = 'admin1@cr.test';
update public.profiles set role = 'admin', username = 'admin2', full_name = 'Admin Two'
  where email = 'admin2@cr.test';

update public.profiles set role = 'referring_doctor', username = 'doc1', full_name = 'Referring Doctor One'
  where email = 'doc1@cr.test';
update public.profiles set role = 'referring_doctor', username = 'doc2', full_name = 'Referring Doctor Two'
  where email = 'doc2@cr.test';

-- Added alongside backend/database/008_super_admin.sql — create superadmin1@cr.test
-- in Authentication -> Users first, same as every other account above, then
-- re-run this whole script (it's idempotent).
update public.profiles set role = 'super_admin', username = 'superadmin1', full_name = 'Super Admin One'
  where email = 'superadmin1@cr.test';

-- Sanity check — should return exactly 11 rows (two per role above, one super_admin).
select email, username, role, full_name from public.profiles
  where email like '%@cr.test'
  order by role, username;

-- ============================================================================
-- END OF MIGRATION 003
-- ============================================================================
