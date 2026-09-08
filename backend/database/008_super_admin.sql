-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 008: super_admin role
-- Run in Supabase SQL Editor AFTER backend/database/schema.sql (and 002/003/004 if used).
--
-- Separation of duties: `admin` runs the clinic day-to-day (KPIs, billing,
-- equipment, inventory, content, reports, security alerts) — none of that
-- changes here. `super_admin` is a superset that ALSO gets the one thing
-- admin deliberately never had: the power to create accounts, change roles,
-- deactivate/reactivate staff, and approve/reject referring-doctor access
-- requests. Whoever can grant system access is a smaller set of people than
-- whoever runs daily operations — that's the whole point of splitting it out
-- rather than just giving admin more buttons.
--
-- IMPORTANT — run the very first statement below on its own first if your
-- Postgres version complains about using a new enum value in the same
-- transaction it was added in (older PG only; Supabase's is fine, but this
-- keeps the script safe either way).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUM
-- ----------------------------------------------------------------------------
alter type user_role add value if not exists 'super_admin';

-- ----------------------------------------------------------------------------
-- 2. ROLE-CHECK FUNCTIONS
-- ----------------------------------------------------------------------------
-- super_admin is a superset of admin for every OTHER admin-gated resource
-- (billing, equipment, inventory, content, reports, audit, staff/patient
-- messaging) — redefining is_admin()/is_staff() to include it means none of
-- those existing policies need to change at all.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.get_user_role() in ('admin', 'super_admin');
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.get_user_role() in ('technician', 'radiologist', 'admin', 'super_admin');
$$;

-- The one new check: account/role management is gated on THIS, not is_admin().
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.get_user_role() = 'super_admin';
$$;

-- reports_radiologist_write (schema.sql) hardcodes a role list directly
-- instead of going through is_admin() — keep super_admin's reach consistent
-- with admin's here too.
drop policy if exists "reports_radiologist_write" on public.radiology_reports;
create policy "reports_radiologist_write" on public.radiology_reports
  for all
  using (public.get_user_role() in ('radiologist', 'admin', 'super_admin'))
  with check (public.get_user_role() in ('radiologist', 'admin', 'super_admin'));

-- ----------------------------------------------------------------------------
-- 3. RESTRICT ACCOUNT/ROLE MANAGEMENT TO super_admin
-- ----------------------------------------------------------------------------
-- profiles_admin_all previously gated on is_admin(), which — now that
-- is_admin() includes super_admin — would let a regular admin update ANY
-- profile's role via a direct table write even with no UI button for it.
-- Replacing it with is_super_admin() is what actually makes "only
-- super_admin manages accounts/roles" true at the data layer, not just in
-- the UI.
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_super_admin_all" on public.profiles
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- Referring-doctor request approval provisions a real auth account — moved
-- to super_admin-only per the same reasoning.
drop policy if exists "doctor_requests_admin_read" on public.referring_doctor_requests;
create policy "doctor_requests_super_admin_read" on public.referring_doctor_requests
  for select using (public.is_super_admin());

drop policy if exists "doctor_requests_admin_update" on public.referring_doctor_requests;
create policy "doctor_requests_super_admin_update" on public.referring_doctor_requests
  for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "doctor_requests_admin_delete" on public.referring_doctor_requests;
create policy "doctor_requests_super_admin_delete" on public.referring_doctor_requests
  for delete using (public.is_super_admin());

drop policy if exists "referring_doctor_details_admin_write" on public.referring_doctor_details;
create policy "referring_doctor_details_super_admin_write" on public.referring_doctor_details
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ============================================================================
-- END OF MIGRATION 008
--
-- profiles.is_active already existed (schema.sql) but was never enforced —
-- app/(app)/layout.tsx now checks it on every protected page load and signs
-- a deactivated user out. No schema change needed for that part.
-- ============================================================================
