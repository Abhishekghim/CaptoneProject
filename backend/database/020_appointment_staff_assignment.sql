-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 020: appointment staff assignment columns
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-019).
--
-- Bug fix, not a new feature: `assigned_technician_id`/`assigned_radiologist_id`
-- are part of the mock Appointment type (shared/types.ts) and are already
-- read/written by frontend/components/shared/AppointmentManageForm.tsx
-- (assignStaffToAppointment rewiring, Phase 3b) and
-- frontend/components/technician/TechnicianPortal.tsx (Phase 5b's "assigned
-- to you" queue display) — but these two columns were never actually added
-- to public.appointments in migration 013 (arrival workflow) or anywhere
-- else. Without this migration, every real query/update touching either
-- column fails at runtime with "column does not exist". This migration adds
-- exactly the two missing columns; no RLS/trigger changes are needed since
-- the existing row-level "own or staff" update policy on appointments
-- (appts_patient_cancel_own) already covers writes to any column on a row
-- staff are permitted to update.
-- ============================================================================

alter table public.appointments
  add column if not exists assigned_technician_id uuid references public.profiles(id) on delete set null;

alter table public.appointments
  add column if not exists assigned_radiologist_id uuid references public.profiles(id) on delete set null;

-- ============================================================================
-- END OF MIGRATION 020
-- ============================================================================
