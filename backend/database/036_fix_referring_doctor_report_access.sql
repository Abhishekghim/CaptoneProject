-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 036: fix referring-doctor report access
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-035 if used).
--
-- Real bug, found 2026-09-27 while wiring sample data for a referring
-- doctor (doc1): the CURRENT schema.sql already has the correct
-- reports_patient_read_finalized policy text — using (a.patient_id =
-- auth.uid() OR a.referring_doctor_id = auth.uid()) — but that policy is
-- only ever defined in schema.sql itself, never touched by a numbered
-- migration. schema.sql is a one-time initial setup script, not something
-- Supabase re-runs — so a project whose schema.sql was run before the
-- referring-doctor clause was added to that file is still running the
-- older (patient-only) version live, with no migration to ever have caught
-- it up. Confirmed empirically: signed in as doc1 with a real session,
-- `select * from radiology_reports` returned 0 rows for a report that IS
-- finalized and whose scan's appointment.referring_doctor_id IS doc1 —
-- `appts_referring_doctor_read` correctly returned that appointment, so the
-- gap is specifically in the reports policy, not auth/session handling.
--
-- This re-applies the policy verbatim (a policy has no "or replace" in
-- Postgres, so drop + create) so it's correct regardless of which version
-- happens to be live.
-- ============================================================================

drop policy if exists "reports_patient_read_finalized" on public.radiology_reports;
create policy "reports_patient_read_finalized" on public.radiology_reports
  for select using (
    public.is_staff()
    or (
      status = 'finalized'
      and exists (
        select 1
        from public.mri_scans s
        join public.appointments a on a.id = s.appointment_id
        where s.id = scan_id and (a.patient_id = auth.uid() or a.referring_doctor_id = auth.uid())
      )
    )
  );

-- ============================================================================
-- END OF MIGRATION 036
-- ============================================================================
