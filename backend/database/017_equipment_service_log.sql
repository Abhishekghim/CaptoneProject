-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 017: equipment service log
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-016).
--
-- Phase 5a of moving off frontend/lib/store.tsx mock data onto real Supabase
-- persistence. Ports the `equipmentServiceLog` mock array (written by
-- scheduleEquipmentService ~lines 902-932 and registerEquipment ~lines
-- 934-966, `EquipmentServiceRecord` in shared/types.ts) into a real table.
-- `equipment_logs` itself (schema.sql 2.7) already exists and needs no
-- changes — this is purely the append-only history of service actions
-- performed on it, so its RLS mirrors `equipment_logs`' own policies
-- exactly: staff read, admin write.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. equipment_service_log table
-- ----------------------------------------------------------------------------
create table public.equipment_service_log (
  id            uuid primary key default uuid_generate_v4(),
  equipment_id  uuid not null references public.equipment_logs (id) on delete cascade,
  performed_by  uuid references public.profiles (id) on delete set null,
  action        text not null check (action in ('calibration', 'maintenance', 'registered')),
  notes         text,
  performed_at  timestamptz not null default now()
);

create index if not exists idx_equipment_service_log_equipment
  on public.equipment_service_log (equipment_id, performed_at desc);

-- ----------------------------------------------------------------------------
-- 2. RLS — mirrors equipment_logs (equipment_staff_read / equipment_admin_write)
-- ----------------------------------------------------------------------------
alter table public.equipment_service_log enable row level security;

drop policy if exists "equipment_service_log_staff_read" on public.equipment_service_log;
create policy "equipment_service_log_staff_read" on public.equipment_service_log
  for select using (public.is_staff());

drop policy if exists "equipment_service_log_admin_write" on public.equipment_service_log;
create policy "equipment_service_log_admin_write" on public.equipment_service_log
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- END OF MIGRATION 017
-- ============================================================================
