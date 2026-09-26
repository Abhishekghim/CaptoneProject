-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 019: scan + equipment RPCs
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-018).
--
-- Phase 5a of moving off frontend/lib/store.tsx mock data onto real Supabase
-- persistence. Three RPCs porting logScan / scheduleEquipmentService /
-- registerEquipment from the mock store onto real transactional Postgres
-- functions. All three are plain SECURITY INVOKER (the default — no
-- DEFINER clause below): they run as the calling user and are fully subject
-- to existing RLS, same convention as 015_appointment_billing_rpcs.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. equipment_usage_update_staff — new UPDATE-only RLS policy on
-- equipment_logs.
--
-- Real gap this closes: equipment_admin_write (schema.sql 5, "equipment_logs")
-- is `for all using (is_admin())`, so under SECURITY INVOKER, log_scan below
-- could not bump usage_hours for a technician calling it (a technician is
-- staff, not admin). This policy grants UPDATE only — not insert/delete/
-- select, which remain governed by equipment_staff_read / equipment_admin_write
-- as before — to any staff member (technicians logging scans is the only
-- staff-level equipment write path that exists today; admin already has
-- full access via the existing policy).
-- ----------------------------------------------------------------------------
drop policy if exists "equipment_usage_update_staff" on public.equipment_logs;
create policy "equipment_usage_update_staff" on public.equipment_logs
  for update using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 2. log_scan — ports frontend/lib/store.tsx logScan (~lines 488-515):
--
--   const scan: MriScan = { ..., technician_id: currentUser.id, performed_at: new Date().toISOString() };
--   setScans(prev => [scan, ...prev]);
--   setAppointments(prev => prev.map(a => a.id === input.appointment_id ? { ...a, status: "completed" } : a));
--   setEquipment(prev => prev.map(e => e.machine_name === input.machine_name
--     ? { ...e, usage_hours: e.usage_hours + Math.ceil(input.scan_duration / 60) } : e));
--
-- All three writes happen in one transaction (a plpgsql function body runs
-- in the caller's transaction, so all three commit or roll back together).
-- Deliberately narrower than the mock action: no audit-log write here
-- (writeAudit "SCAN_LOGGED") — audit writes stay a phase-10 concern, same
-- as book_appointment/reschedule_appointment in migration 015.
--
-- RLS still applies under SECURITY INVOKER: the mri_scans insert requires
-- scans_staff_write (is_staff()), the appointments update requires
-- appts_patient_cancel_own's is_staff() branch, and the equipment_logs
-- update requires the new equipment_usage_update_staff policy above.
-- ----------------------------------------------------------------------------
create or replace function public.log_scan(
  p_appointment_id uuid,
  p_body_part text,
  p_protocol text,
  p_scan_duration integer,
  p_machine_name text,
  p_dicom_image_url text
)
returns public.mri_scans
language plpgsql
as $$
declare
  v_scan public.mri_scans;
begin
  insert into public.mri_scans (
    appointment_id, body_part, protocol, scan_duration,
    technician_id, machine_name, dicom_image_url, performed_at
  ) values (
    p_appointment_id, p_body_part, p_protocol, p_scan_duration,
    auth.uid(), p_machine_name, p_dicom_image_url, now()
  )
  returning * into v_scan;

  update public.appointments
  set status = 'completed'
  where id = p_appointment_id;

  update public.equipment_logs
  set usage_hours = usage_hours + ceil(p_scan_duration / 60.0)::integer
  where machine_name = p_machine_name;

  return v_scan;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. schedule_equipment_service — ports frontend/lib/store.tsx
-- scheduleEquipmentService (~lines 902-932):
--
--   setEquipment(prev => prev.map(e => e.id === equipmentId ? {
--     ...e, status: "operational",
--     last_calibration: today, maintenance_due: today + 90 days,
--   } : e));
--   setEquipmentServiceLog(prev => [{ id, equipment_id: equipmentId,
--     performed_by: currentUser.id, action: "calibration",
--     notes: "Routine calibration and recalibration completed.",
--     performed_at: now() }, ...prev]);
--
-- Admin-gated by the existing equipment_admin_write RLS (left as admin-only,
-- matching the mock UI) — this migration adds no new policy for it.
-- ----------------------------------------------------------------------------
create or replace function public.schedule_equipment_service(
  p_equipment_id uuid
)
returns public.equipment_logs
language plpgsql
as $$
declare
  v_equipment public.equipment_logs;
begin
  update public.equipment_logs
  set
    status = 'operational',
    last_calibration = current_date,
    maintenance_due = current_date + interval '90 days'
  where id = p_equipment_id
  returning * into v_equipment;

  if v_equipment.id is null then
    raise exception 'Equipment not found or you do not have permission to service it.';
  end if;

  insert into public.equipment_service_log (equipment_id, performed_by, action, notes)
  values (p_equipment_id, auth.uid(), 'calibration', 'Routine calibration and recalibration completed.');

  return v_equipment;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. register_equipment — ports frontend/lib/store.tsx registerEquipment
-- (~lines 934-966):
--
--   setEquipment(prev => [{ id, machine_name, model, status: "operational",
--     last_calibration: today, maintenance_due: today + 90 days,
--     usage_hours: 0 }, ...prev]);
--   setEquipmentServiceLog(prev => [{ id, equipment_id: equipmentId,
--     performed_by: currentUser.id, action: "registered",
--     notes: `${machine_name} (${model}) registered to the fleet.`,
--     performed_at: now() }, ...prev]);
--
-- Admin-gated by the existing equipment_admin_write RLS (left as admin-only,
-- matching the mock UI) — this migration adds no new policy for it.
-- ----------------------------------------------------------------------------
create or replace function public.register_equipment(
  p_machine_name text,
  p_model text
)
returns public.equipment_logs
language plpgsql
as $$
declare
  v_equipment public.equipment_logs;
begin
  insert into public.equipment_logs (
    machine_name, model, status, usage_hours, last_calibration, maintenance_due
  ) values (
    p_machine_name, p_model, 'operational', 0, current_date, current_date + interval '90 days'
  )
  returning * into v_equipment;

  insert into public.equipment_service_log (equipment_id, performed_by, action, notes)
  values (
    v_equipment.id, auth.uid(), 'registered',
    p_machine_name || ' (' || p_model || ') registered to the fleet.'
  );

  return v_equipment;
end;
$$;

-- ============================================================================
-- END OF MIGRATION 019
-- ============================================================================
