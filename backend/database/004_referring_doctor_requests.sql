-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 004: Referring doctor request-then-approve
-- Run in Supabase SQL Editor AFTER backend/database/schema.sql (and 002/003 if used).
--
-- Real-world nuance: referring doctors are external to the business, so they
-- are NOT provisioned the way internal staff (technician/radiologist/admin)
-- are. Internal roles stay "super_admin creates it, done" — via
-- supabase.auth.admin.inviteUserByEmail or the Supabase dashboard, exactly as
-- documented in app/signup/page.tsx. A referring doctor instead submits a
-- request (name, practice, AHPRA registration number) from a public,
-- unauthenticated page; it lands in this table as 'pending'; an admin
-- approves or rejects it. Only approval provisions an actual auth.users /
-- profiles row — see app/api/admin/doctor-requests/[id]/approve/route.ts,
-- which is the only code path allowed to do that (it uses the service-role
-- key to call the Auth Admin API; nothing here can create an auth user by
-- itself, on purpose).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUM
-- ----------------------------------------------------------------------------
do $$ begin
  create type doctor_request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.referring_doctor_requests (
  id                uuid primary key default uuid_generate_v4(),
  full_name         text not null,
  email             text not null,
  practice_name     text not null,
  ahpra_number      text not null,
  phone             text,
  message           text,
  status            doctor_request_status not null default 'pending',
  rejection_reason  text,
  reviewed_by       uuid references public.profiles (id) on delete set null,
  reviewed_at       timestamptz,
  created_profile_id uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- AHPRA registration numbers are a 3-letter profession code + 10 digits
  -- (e.g. MED0001234567). Stored upper-cased for consistent matching.
  constraint ahpra_number_format check (ahpra_number ~ '^[A-Z]{3}[0-9]{10}$'),
  constraint email_format check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Reviewed rows must record who reviewed them and when, and only rows that
  -- moved past 'pending' may carry a reviewed_by/reviewed_at/rejection_reason
  -- at all. This is enforced again by RLS on insert (see below) so a public,
  -- unauthenticated submitter can't forge an already-approved row — this
  -- CHECK is defense in depth for any other caller.
  constraint reviewed_fields_consistent check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint rejection_reason_when_rejected check (
    (status = 'rejected') = (rejection_reason is not null)
  ),
  constraint created_profile_only_when_approved check (
    created_profile_id is null or status = 'approved'
  )
);

-- One outstanding request per email at a time — stops a doctor (or someone
-- else) from spamming duplicate pending submissions. They can resubmit after
-- a rejection (that row is no longer 'pending', so it doesn't collide).
create unique index if not exists idx_doctor_requests_pending_email
  on public.referring_doctor_requests (lower(email))
  where status = 'pending';

create index if not exists idx_doctor_requests_status
  on public.referring_doctor_requests (status, created_at desc);

-- Guards against someone (re)submitting a request for an email that already
-- has ANY account (patient, staff, or a previously-approved referring
-- doctor) — they should sign in or use password reset instead of queuing a
-- pointless second request. Security definer so it can read `profiles`
-- regardless of the inserting role's own RLS visibility (the same pattern as
-- get_email_for_username() in backend/database/002_usernames.sql).
create or replace function public.prevent_doctor_request_for_existing_account()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where lower(email) = lower(new.email)) then
    raise exception 'An account already exists for this email address — sign in instead of requesting access again.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_doctor_request_no_dup_account on public.referring_doctor_requests;
create trigger trg_doctor_request_no_dup_account
  before insert on public.referring_doctor_requests
  for each row execute function public.prevent_doctor_request_for_existing_account();

drop trigger if exists trg_doctor_requests_touch on public.referring_doctor_requests;
create trigger trg_doctor_requests_touch before update on public.referring_doctor_requests
  for each row execute function public.touch_updated_at();

-- Same append-only audit trail treatment as the other sensitive tables
-- (FR72, FR74) — every submission and every approve/reject decision is
-- traceable, including from the anonymous submitter (user_id will be null
-- for the initial insert, same as write_audit already handles elsewhere).
drop trigger if exists trg_audit_doctor_requests on public.referring_doctor_requests;
create trigger trg_audit_doctor_requests
  after insert or update on public.referring_doctor_requests
  for each row execute function public.write_audit();

-- 2.1 referring_doctor_details — role-specific fields for an *approved*
-- referring doctor, split out of `profiles` (same pattern as
-- radiologist_details / technician_details in schema.sql section 2.12/2.13).
create table if not exists public.referring_doctor_details (
  profile_id     uuid primary key references public.profiles (id) on delete cascade,
  practice_name  text not null,
  ahpra_number   text not null,
  request_id     uuid references public.referring_doctor_requests (id) on delete set null
);

-- Populate referring_doctor_details automatically the moment a request is
-- marked approved and linked to the newly-provisioned profile — keeps the
-- "approve" API route simple (it only ever writes to
-- referring_doctor_requests) and keeps this derivation in one place.
create or replace function public.handle_doctor_request_approved()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.created_profile_id is not null then
    insert into public.referring_doctor_details (profile_id, practice_name, ahpra_number, request_id)
    values (new.created_profile_id, new.practice_name, new.ahpra_number, new.id)
    on conflict (profile_id) do update
      set practice_name = excluded.practice_name,
          ahpra_number = excluded.ahpra_number,
          request_id = excluded.request_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_doctor_request_approved on public.referring_doctor_requests;
create trigger trg_doctor_request_approved
  after update on public.referring_doctor_requests
  for each row execute function public.handle_doctor_request_approved();

-- ----------------------------------------------------------------------------
-- 3. ROW-LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.referring_doctor_requests enable row level security;
alter table public.referring_doctor_details  enable row level security;

-- Anyone — including an unauthenticated visitor on the public request page —
-- may file a new request, but only ever a fresh 'pending' one with no review
-- fields set. They can never insert a row that claims to already be
-- approved/rejected or that names a reviewer.
drop policy if exists "doctor_requests_public_insert" on public.referring_doctor_requests;
create policy "doctor_requests_public_insert" on public.referring_doctor_requests
  for insert
  with check (
    status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and created_profile_id is null
    and rejection_reason is null
  );

-- Nobody can read the queue except admins — in particular, the submitter
-- gets no read access to their own request row (there's no account yet for
-- RLS to scope "own" to). The public page only ever inserts; it shows a
-- static confirmation message, not a status lookup.
drop policy if exists "doctor_requests_admin_read" on public.referring_doctor_requests;
create policy "doctor_requests_admin_read" on public.referring_doctor_requests
  for select using (public.is_admin());

-- Only admins can transition a request (approve/reject).
drop policy if exists "doctor_requests_admin_update" on public.referring_doctor_requests;
create policy "doctor_requests_admin_update" on public.referring_doctor_requests
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "doctor_requests_admin_delete" on public.referring_doctor_requests;
create policy "doctor_requests_admin_delete" on public.referring_doctor_requests
  for delete using (public.is_admin());

-- referring_doctor_details — same visibility shape as radiologist_details /
-- technician_details: the doctor can read their own, staff/admin can read
-- any, only admin (via the approval trigger, which is security definer) or
-- the trigger itself writes it.
drop policy if exists "referring_doctor_details_read" on public.referring_doctor_details;
create policy "referring_doctor_details_read" on public.referring_doctor_details
  for select using (profile_id = auth.uid() or public.is_staff());

drop policy if exists "referring_doctor_details_admin_write" on public.referring_doctor_details;
create policy "referring_doctor_details_admin_write" on public.referring_doctor_details
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- END OF MIGRATION 004
-- ============================================================================
