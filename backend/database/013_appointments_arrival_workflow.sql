-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 013: appointments — Reception Portal fields +
-- arrival state machine
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-012).
--
-- Phase 3a of moving off frontend/lib/seed.ts / frontend/lib/store.tsx mock
-- data onto real Supabase persistence — Appointments front-desk arrival
-- workflow. Adds the Reception Portal columns that already exist on the
-- Appointment type in shared/types.ts (confirmed, arrival_status,
-- arrived_at, checked_in_at, cancellation_reason, referral_status_override)
-- but were only ever carried in the mock store's in-memory state.
--
-- Also ports frontend/lib/store.tsx's ARRIVAL_TRANSITIONS /
-- canTransitionArrival() — the front-desk arrival state machine — into a
-- database trigger, so an invalid transition is rejected at the data layer
-- regardless of caller (RPC, direct client update, future admin tooling),
-- not just by the mock UI's own pre-check. See store.tsx lines ~37-52:
--
--   const ARRIVAL_TRANSITIONS: Record<ArrivalStatus, ArrivalStatus[]> = {
--     not_arrived: ["arrived", "checked_in", "waiting", "no_show"],
--     arrived: ["checked_in", "waiting", "no_show"],
--     checked_in: ["waiting", "no_show"],
--     waiting: ["no_show"],
--     no_show: ["arrived", "checked_in", "waiting"],
--   };
--   export function canTransitionArrival(from: ArrivalStatus, to: ArrivalStatus): boolean {
--     if (from === to) return true;
--     return ARRIVAL_TRANSITIONS[from]?.includes(to) ?? false;
--   }
--
-- "from === to" (same-state, idempotent) is always allowed — deliberately
-- permissive per the comment above that block in store.tsx: real front
-- desks re-click the same action constantly. The trigger below mirrors this
-- by only evaluating the adjacency list when arrival_status is actually
-- changing.
-- ============================================================================

alter table public.appointments add column if not exists confirmed boolean not null default false;
alter table public.appointments add column if not exists arrival_status text not null default 'not_arrived'
  check (arrival_status in ('not_arrived', 'arrived', 'checked_in', 'waiting', 'no_show'));
alter table public.appointments add column if not exists arrived_at timestamptz;
alter table public.appointments add column if not exists checked_in_at timestamptz;
alter table public.appointments add column if not exists cancellation_reason text;
alter table public.appointments add column if not exists referral_status_override text
  check (referral_status_override is null or referral_status_override in ('missing', 'received', 'pending_verification', 'verified', 'expired', 'rejected'));

-- Arrival state machine — faithful port of ARRIVAL_TRANSITIONS above.
-- Deliberately plain SECURITY INVOKER (no DEFINER): this is a pure
-- validation gate, it doesn't need elevated privileges, and running as
-- invoker keeps it subject to the same RLS as everything else on this
-- table.
create or replace function public.enforce_arrival_transition()
returns trigger
language plpgsql
as $$
declare
  v_allowed text[];
begin
  -- Same-state transitions are always allowed (idempotent re-clicks) and
  -- skip the adjacency check entirely, matching canTransitionArrival's
  -- "if (from === to) return true" short-circuit.
  if new.arrival_status is distinct from old.arrival_status then
    v_allowed := case old.arrival_status
      when 'not_arrived' then array['arrived', 'checked_in', 'waiting', 'no_show']
      when 'arrived'     then array['checked_in', 'waiting', 'no_show']
      when 'checked_in'  then array['waiting', 'no_show']
      when 'waiting'     then array['no_show']
      when 'no_show'     then array['arrived', 'checked_in', 'waiting']
      else array[]::text[]
    end;

    if not (new.arrival_status = any (v_allowed)) then
      raise exception 'Invalid arrival transition from % to %', old.arrival_status, new.arrival_status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_appts_enforce_arrival_transition on public.appointments;
create trigger trg_appts_enforce_arrival_transition
  before update on public.appointments
  for each row execute function public.enforce_arrival_transition();

-- No RLS changes needed: appts_patient_cancel_own (schema.sql) already lets
-- staff (is_staff(), which includes reception) update any appointment row,
-- which covers writing the new arrival/confirmation columns; the trigger
-- above adds a further data-layer check on top, not a broader grant.

-- ============================================================================
-- END OF MIGRATION 013
-- ============================================================================
