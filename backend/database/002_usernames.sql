-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 002: Usernames
-- Run in Supabase SQL Editor AFTER backend/database/schema.sql.
-- Adds an optional, unique username per profile so patients can log in with
-- either their email or a username. Case-insensitive ("JohnDoe" and
-- "johndoe" are the same username).
-- ============================================================================

alter table public.profiles add column if not exists username text;

do $$ begin
  alter table public.profiles add constraint username_format
    check (username is null or username ~ '^[a-zA-Z0-9_]{3,24}$');
exception when duplicate_object then null; end $$;

create unique index if not exists idx_profiles_username_lower
  on public.profiles (lower(username))
  where username is not null;

-- handle_new_user (originally defined in schema.sql) now also stores the
-- username passed as signup metadata (see app/signup/page.tsx). Everything
-- else about this function is unchanged.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'patient'),
    nullif(new.raw_user_meta_data ->> 'username', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Lets the (unauthenticated) login page resolve "username" -> "email" before
-- calling supabase.auth.signInWithPassword(), which only accepts an email.
-- Deliberately narrow: this is the ONLY thing an anonymous caller can read
-- about profiles — a single exact-username lookup, not a general SELECT
-- policy on the table. security definer so it can read profiles regardless
-- of the caller's own RLS visibility.
create or replace function public.get_email_for_username(p_username text)
returns text
language sql stable security definer set search_path = public
as $$
  select email from public.profiles where lower(username) = lower(p_username) limit 1;
$$;

grant execute on function public.get_email_for_username(text) to anon, authenticated;

-- Lets the signup page check availability before submitting, for a clean
-- inline error instead of a raw constraint-violation message.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;

-- ============================================================================
-- END OF MIGRATION 002
-- ============================================================================
