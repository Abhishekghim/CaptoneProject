-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 023: messaging send RPCs
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-022, especially
-- 022_messaging.sql which this depends on).
--
-- Phase 7 of moving off frontend/lib/store.tsx mock data onto real Supabase
-- persistence — Messaging (FR41, FR43). message_threads/messages have no
-- client-facing insert policy (see 022_messaging.sql), so all thread
-- find-or-create + message insertion is done here, in security definer
-- functions that perform their own authorization check in the function body
-- (security definer bypasses RLS, so the check has to happen explicitly).
--
-- Mirrors frontend/lib/store.tsx sendPatientMessage (~761-783) and
-- sendInternalMessage (~785-801): find-or-create the thread, then append a
-- message with sender_name/sender_role denormalized from the sender's own
-- profile at write time (exactly as the mock denormalizes from currentUser).
-- ============================================================================

create or replace function public.send_patient_message(p_patient_id uuid, p_body text)
returns public.messages
language plpgsql security definer set search_path = public
as $$
declare
  v_thread_id   uuid;
  v_sender_name text;
  v_sender_role text;
  v_message     public.messages;
begin
  if not (public.is_staff() or auth.uid() = p_patient_id) then
    raise exception 'Not authorized to message this thread.';
  end if;

  select id into v_thread_id from public.message_threads where kind = 'patient' and patient_id = p_patient_id;
  if not found then
    begin
      insert into public.message_threads (kind, patient_id) values ('patient', p_patient_id) returning id into v_thread_id;
    exception when unique_violation then
      -- Another concurrent call won the race and already created this
      -- patient's thread (enforced by idx_message_threads_one_per_patient) —
      -- just use theirs instead of failing.
      select id into v_thread_id from public.message_threads where kind = 'patient' and patient_id = p_patient_id;
    end;
  end if;

  select full_name, role into v_sender_name, v_sender_role from public.profiles where id = auth.uid();

  insert into public.messages (thread_id, sender_id, sender_name, sender_role, body)
  values (v_thread_id, auth.uid(), coalesce(v_sender_name, 'Unknown'), coalesce(v_sender_role, 'patient'), p_body)
  returning * into v_message;

  return v_message;
end;
$$;

create or replace function public.send_internal_message(p_body text)
returns public.messages
language plpgsql security definer set search_path = public
as $$
declare
  v_thread_id   uuid;
  v_sender_name text;
  v_sender_role text;
  v_message     public.messages;
begin
  if not public.is_staff() then
    raise exception 'Staff access required.';
  end if;

  select id into v_thread_id from public.message_threads where kind = 'internal';
  if not found then
    begin
      insert into public.message_threads (kind, patient_id) values ('internal', null) returning id into v_thread_id;
    exception when unique_violation then
      -- Another concurrent call already created the single internal thread
      -- (enforced by idx_message_threads_one_internal) — use it.
      select id into v_thread_id from public.message_threads where kind = 'internal';
    end;
  end if;

  select full_name, role into v_sender_name, v_sender_role from public.profiles where id = auth.uid();

  insert into public.messages (thread_id, sender_id, sender_name, sender_role, body)
  values (v_thread_id, auth.uid(), coalesce(v_sender_name, 'Unknown'), coalesce(v_sender_role, 'admin'), p_body)
  returning * into v_message;

  return v_message;
end;
$$;

-- ============================================================================
-- END OF MIGRATION 023
-- ============================================================================
