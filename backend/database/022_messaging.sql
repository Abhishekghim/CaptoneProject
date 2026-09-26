-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 022: messaging tables (patient<->staff,
-- internal staff<->staff)
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-021).
--
-- Phase 7 of moving off frontend/lib/store.tsx mock data onto real Supabase
-- persistence — Messaging (FR41 patient<->staff, FR43 internal staff<->staff)
-- and Notification Preferences. This migration covers the messaging schema;
-- see 023_messaging_rpcs.sql for the find-or-create send RPCs and
-- 024_notification_preferences.sql for the preferences table.
--
-- Mirrors shared/types.ts MessageThread/Message exactly (frontend/lib/
-- store.tsx sendPatientMessage/sendInternalMessage, ~lines 761-801): two
-- thread "kinds" cover both requirements with one model — a "patient" thread
-- is the patient plus whichever staff member replies, and there is exactly
-- one "internal" thread shared by all staff.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- message_threads
-- ----------------------------------------------------------------------------
create table if not exists public.message_threads (
  id uuid primary key default uuid_generate_v4(),
  kind text not null check (kind in ('patient', 'internal')),
  patient_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint patient_thread_has_patient check (
    (kind = 'patient' and patient_id is not null) or (kind = 'internal' and patient_id is null)
  )
);

-- These two partial unique indexes are what make find-or-create safe under
-- concurrency: at most one internal thread ever exists, and at most one
-- thread per patient — a race between two find-or-create calls raises
-- unique_violation instead of creating a duplicate thread. The RPCs in
-- 023_messaging_rpcs.sql catch that and just re-select the existing thread.
create unique index if not exists idx_message_threads_one_internal on public.message_threads (kind) where kind = 'internal';
create unique index if not exists idx_message_threads_one_per_patient on public.message_threads (patient_id) where kind = 'patient';

-- ----------------------------------------------------------------------------
-- messages
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_name text not null,
  sender_role text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_thread on public.messages (thread_id, created_at);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.message_threads enable row level security;
alter table public.messages enable row level security;

-- A patient can see their own thread; staff can see every thread (internal
-- threads are staff-only, which this policy already achieves since a
-- patient's patient_id = auth.uid() check only ever matches kind='patient'
-- rows). No insert/update/delete policy on either table — thread/message
-- creation is routed entirely through the security definer RPCs in
-- 023_messaging_rpcs.sql, so RLS default-denies direct client writes.
drop policy if exists "message_threads_read" on public.message_threads;
create policy "message_threads_read" on public.message_threads
  for select using (public.is_staff() or (kind = 'patient' and patient_id = auth.uid()));

drop policy if exists "messages_read" on public.messages;
create policy "messages_read" on public.messages
  for select using (
    exists (
      select 1 from public.message_threads t
      where t.id = thread_id and (public.is_staff() or (t.kind = 'patient' and t.patient_id = auth.uid()))
    )
  );

-- ============================================================================
-- END OF MIGRATION 022
-- ============================================================================
