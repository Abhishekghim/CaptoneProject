-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 027: audit trigger coverage
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-026).
--
-- Phase 10 of moving off frontend/lib/store.tsx mock data onto real Supabase
-- persistence — Audit Logging (FR72, FR74, NFR9 — "log all user activities
-- for auditing and compliance"). The shared public.write_audit() trigger
-- function (schema.sql section 4.4) already covers radiology_reports,
-- billing, patient_medical_records (schema.sql), referring_doctor_requests
-- (004_referring_doctor_requests.sql), doctor_referrals
-- (006_doctor_referrals.sql), and content_pages/announcements
-- (011_cms_content.sql). This migration extends the same coverage to the
-- remaining tables that have real user-facing writes but no audit trail yet:
--
--   appointments, mri_scans, equipment_logs, equipment_service_log,
--   image_annotations, message_threads, notification_preferences,
--   inventory_items, inventory_transactions, suppliers
--
-- All ten have a real uuid `id` primary key (confirmed by reading each
-- CREATE TABLE), so the plain write_audit() (which reads NEW/OLD.id) applies
-- directly to every one of them — none needs the write_audit_body_part()-
-- style keyed-by-a-different-column workaround that 011_cms_content.sql
-- established for prep_instructions/scan_prices.
--
-- Deliberately NOT covered here: `messages` (022_messaging.sql) — the actual
-- chat message bodies (patient<->staff / internal staff<->staff). write_
-- audit() copies the entire row (to_jsonb(new)) into audit_logs.details,
-- which for `messages` would duplicate potentially sensitive chat content
-- into a second table. This app already has an explicit precedent against
-- that for conversational content: the comment on logAssistantAction in
-- frontend/lib/store.tsx (~lines 750-753) states assistant audit logging is
-- "metadata only, never the chat content." Same principle applies here, so
-- `messages` is skipped. `message_threads` (thread kind/patient_id/
-- created_at only — no message bodies) carries no such risk and IS audited
-- below.
-- ============================================================================

drop trigger if exists trg_audit_appointments on public.appointments;
create trigger trg_audit_appointments
  after insert or update or delete on public.appointments
  for each row execute function public.write_audit();

drop trigger if exists trg_audit_mri_scans on public.mri_scans;
create trigger trg_audit_mri_scans
  after insert or update or delete on public.mri_scans
  for each row execute function public.write_audit();

drop trigger if exists trg_audit_equipment_logs on public.equipment_logs;
create trigger trg_audit_equipment_logs
  after insert or update or delete on public.equipment_logs
  for each row execute function public.write_audit();

drop trigger if exists trg_audit_equipment_service_log on public.equipment_service_log;
create trigger trg_audit_equipment_service_log
  after insert or update or delete on public.equipment_service_log
  for each row execute function public.write_audit();

drop trigger if exists trg_audit_image_annotations on public.image_annotations;
create trigger trg_audit_image_annotations
  after insert or update or delete on public.image_annotations
  for each row execute function public.write_audit();

drop trigger if exists trg_audit_message_threads on public.message_threads;
create trigger trg_audit_message_threads
  after insert or update or delete on public.message_threads
  for each row execute function public.write_audit();

drop trigger if exists trg_audit_inventory_items on public.inventory_items;
create trigger trg_audit_inventory_items
  after insert or update or delete on public.inventory_items
  for each row execute function public.write_audit();

drop trigger if exists trg_audit_inventory_transactions on public.inventory_transactions;
create trigger trg_audit_inventory_transactions
  after insert or update or delete on public.inventory_transactions
  for each row execute function public.write_audit();

drop trigger if exists trg_audit_suppliers on public.suppliers;
create trigger trg_audit_suppliers
  after insert or update or delete on public.suppliers
  for each row execute function public.write_audit();

-- notification_preferences (024_notification_preferences.sql) is the one
-- exception among the ten: it's keyed by `user_id uuid primary key` and has
-- no `id` column at all (it's a one-row-per-user settings table, mirroring
-- the mock's user_id-keyed map — see the migration's own comment). write_
-- audit() reads NEW/OLD.id directly, which would raise "record has no field
-- id" here, so this needs the same sibling-function trick
-- 011_cms_content.sql used for prep_instructions/scan_prices (keyed by
-- body_part instead of id) — a minimal write_audit() clone using user_id as
-- entity_id instead of id. Same audit_logs shape, same security-definer
-- pattern; not a redefinition of write_audit() itself, which every table
-- above still relies on.
create or replace function public.write_audit_user_id()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_logs (user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    tg_op || '_' || upper(tg_table_name),
    tg_table_name,
    coalesce(case when tg_op = 'DELETE' then old.user_id::text else new.user_id::text end, 'n/a'),
    case when tg_op = 'DELETE'
         then jsonb_build_object('old', to_jsonb(old))
         else jsonb_build_object('new', to_jsonb(new))
    end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_notification_preferences on public.notification_preferences;
create trigger trg_audit_notification_preferences
  after insert or update or delete on public.notification_preferences
  for each row execute function public.write_audit_user_id();

-- ============================================================================
-- END OF MIGRATION 027
-- ============================================================================
