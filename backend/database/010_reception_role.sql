-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 010: reception role
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-009 if used).
--
-- Reception is front-desk staff: check-in, scheduling, referral/payment
-- administrative status, patient contact lookup. Given is_staff() (staff-
-- level READ access to profiles/patient_medical_records), same as
-- technician/radiologist/admin/super_admin — reception legitimately needs
-- to look up patients. NOT given is_admin() — billing-admin actions,
-- equipment, content management, staff accounts, account-deletion
-- requests, doctor-request approval, and security events all stay out of
-- reach. NOT added to the `dicom` bucket read policy or `radiology_reports`
-- policies at all — both already hard-code specific roles explicitly
-- (technician/radiologist/(super_)admin), so reception is excluded
-- automatically without needing a special-case denial anywhere.
-- ============================================================================

alter type user_role add value if not exists 'reception';

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.get_user_role() in ('technician', 'radiologist', 'admin', 'super_admin', 'reception');
$$;

-- is_admin() is deliberately NOT touched — reception must never inherit
-- admin-tier access by way of this change.

-- ============================================================================
-- END OF MIGRATION 010
-- ============================================================================
