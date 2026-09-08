-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 007: Consent, account deletion requests,
-- and suspicious-login detection (NFR10, NFR35, NFR36)
-- Run in Supabase SQL Editor AFTER database/schema.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CONSENT (NFR35) + SELF-SERVICE DELETION REQUEST (NFR36)
-- ----------------------------------------------------------------------------
-- Both are plain columns on profiles, not new tables — a user can already
-- update their own profile row (see "profiles_update_own" in schema.sql),
-- so no new RLS policy is needed for a patient to set either of these
-- themselves. Admin sees deletion_requested_at is not null via a normal
-- filtered select (already covered by "profiles_admin_all").
alter table public.profiles
  add column if not exists consent_given_at timestamptz,
  add column if not exists deletion_requested_at timestamptz;

-- Redefine handle_new_user (from database/schema.sql) to also stamp consent
-- at profile-creation time, straight from signup metadata — the same
-- mechanism full_name/username already use. This matters because when email
-- confirmation is on, there's no session yet to run a client-side update
-- against profiles_update_own; capturing it in the same security-definer
-- trigger that creates the row sidesteps that timing gap entirely.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, consent_given_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'patient'),
    case when (new.raw_user_meta_data ->> 'consent')::boolean is true then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. SUSPICIOUS / UNAUTHORISED ACCESS DETECTION (NFR10)
-- ----------------------------------------------------------------------------
-- A failed login happens *before* auth.uid() exists, so it can't be written
-- through the normal audit_log flow (that trigger only fires on writes to
-- tables a signed-in user can already reach). This is the one place in the
-- schema where an anonymous, unauthenticated caller is deliberately allowed
-- to insert a row — narrowly, via a single security-definer RPC that only
-- accepts a fixed event_type, not a general-purpose table write.
create table if not exists public.security_events (
  id          uuid primary key default uuid_generate_v4(),
  event_type  text not null check (event_type in ('failed_login')),
  email       text,
  detail      text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_security_events_email_time
  on public.security_events (lower(email), created_at desc);

alter table public.security_events enable row level security;

-- No direct insert/select policy for anon/authenticated — all access goes
-- through the RPC below (insert) or the admin policy (select).
drop policy if exists "security_events_admin_read" on public.security_events;
create policy "security_events_admin_read" on public.security_events
  for select using (public.is_admin());

create or replace function public.log_failed_login(p_email text, p_detail text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.security_events (event_type, email, detail)
  values ('failed_login', lower(trim(p_email)), p_detail);
end;
$$;

grant execute on function public.log_failed_login(text, text) to anon, authenticated;

-- ============================================================================
-- END OF MIGRATION 007
-- ============================================================================
