-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 021: notify the referring doctor too when a
-- report is finalized
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-020).
--
-- Phase 6 of moving off frontend/lib/store.tsx mock data onto real Supabase
-- persistence — the Reporting module (radiology_reports). No schema change:
-- radiology_reports, its RLS, and trg_notify_report_finalized already exist
-- and match the mock closely (see schema.sql section 2.5 and 4.5).
--
-- Real gap this closes: public.notify_on_report_finalized() (schema.sql,
-- section 4.5) only inserts an in-app notification for the patient. The
-- mock's finalizeReport (frontend/lib/store.tsx, ~lines 546-577) also
-- notifies the referring doctor when the appointment has one linked:
--
--   pushNotification(apt.patient_id, "report_ready", "Your MRI report is ready",
--     `Your ${scan?.body_part ?? ""} MRI report has been finalized.`);
--   if (apt.referring_doctor_id) {
--     pushNotification(apt.referring_doctor_id, "report_ready",
--       "A report for your patient is ready",
--       `${patient?.full_name ?? "Your patient"}'s ${scan?.body_part ?? ""} MRI report has been finalized and is available in their record.`);
--   }
--
-- This migration extends the one existing trigger function in place (same
-- security definer, same trigger attachment — trg_notify_report_finalized
-- is left untouched below, just re-declared via `drop trigger if exists` /
-- `create trigger` for idempotent re-runs, exactly as schema.sql does) to
-- also insert the referring-doctor notification. Deliberately still a
-- single trigger function, not a second trigger, per the mock's own
-- structure (one finalize action, two notification targets).
-- ============================================================================

create or replace function public.notify_on_report_finalized()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_patient_id          uuid;
  v_body_part            text;
  v_referring_doctor_id  uuid;
  v_patient_name         text;
begin
  if new.status = 'finalized' and old.status is distinct from 'finalized' then
    select a.patient_id, s.body_part, a.referring_doctor_id
      into v_patient_id, v_body_part, v_referring_doctor_id
    from public.mri_scans s
    join public.appointments a on a.id = s.appointment_id
    where s.id = new.scan_id;

    if v_patient_id is not null then
      insert into public.notifications (user_id, type, title, message)
      values (
        v_patient_id,
        'report_ready',
        'Your MRI report is ready',
        'Your ' || coalesce(v_body_part, '') || ' MRI report has been finalized.'
      );
    end if;

    -- FR42 — referring doctors are never notified when a report is finalized
    -- otherwise; only fires when a referring account exists (a
    -- patient-named doctor without an account, referring_doctor_name with no
    -- referring_doctor_id, has nothing to notify).
    if v_referring_doctor_id is not null then
      select p.full_name into v_patient_name
      from public.profiles p
      where p.id = v_patient_id;

      insert into public.notifications (user_id, type, title, message)
      values (
        v_referring_doctor_id,
        'report_ready',
        'A report for your patient is ready',
        coalesce(v_patient_name, 'Your patient') || '''s ' || coalesce(v_body_part, '') ||
          ' MRI report has been finalized and is available in their record.'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_report_finalized on public.radiology_reports;
create trigger trg_notify_report_finalized
  after update on public.radiology_reports
  for each row execute function public.notify_on_report_finalized();

-- ============================================================================
-- END OF MIGRATION 021
-- ============================================================================
