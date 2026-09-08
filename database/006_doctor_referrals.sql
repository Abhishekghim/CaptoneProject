-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 006: Doctor-initiated referrals ("Path A")
-- Run in Supabase SQL Editor AFTER database/schema.sql (and 002/004/005 if used).
--
-- Alongside 005 (patient names a doctor at booking time, "Path B"), this is
-- the other direction: a doctor who already has an account can refer a
-- patient proactively, before that patient has booked or even signed up.
-- Matching to a real patient account happens by email only — the same
-- unique identifier auth already keys on — never by name+age, which isn't
-- stable or unique. full_name/dob are stored purely as human-readable
-- confirmation for the doctor/technician, not as the matching key.
-- ============================================================================

create table if not exists public.doctor_referrals (
  id                     uuid primary key default uuid_generate_v4(),
  referring_doctor_id    uuid not null references public.profiles (id) on delete cascade,
  patient_full_name      text not null,
  patient_email          text not null,
  patient_dob            date,
  body_part              text not null,
  notes                  text,
  -- Filled in immediately on insert if a matching patient already exists
  -- (see match_doctor_referral_on_insert below), or later by
  -- link_pending_referrals_on_signup the moment a matching patient signs up.
  patient_id             uuid references public.profiles (id) on delete set null,
  -- Filled in once the patient actually books using this referral. Column-
  -- level write restriction isn't expressible in RLS (same caveat as
  -- appts_referring_doctor_update_referral in schema.sql) — acceptable here
  -- since a patient can only ever point this at their own appointment rows.
  used_in_appointment_id uuid references public.appointments (id) on delete set null,
  created_at             timestamptz not null default now(),
  constraint doctor_referral_email_format check (patient_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create index if not exists idx_doctor_referrals_doctor  on public.doctor_referrals (referring_doctor_id, created_at desc);
create index if not exists idx_doctor_referrals_patient on public.doctor_referrals (patient_id) where patient_id is not null;
create index if not exists idx_doctor_referrals_email   on public.doctor_referrals (lower(patient_email));

-- 1. Match immediately on insert if the patient already has an account —
-- mirrors createDoctorReferral in lib/store.tsx.
create or replace function public.match_doctor_referral_on_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.patient_id is null then
    select id into new.patient_id
    from public.profiles
    where role = 'patient' and lower(email) = lower(new.patient_email)
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_match_doctor_referral_on_insert on public.doctor_referrals;
create trigger trg_match_doctor_referral_on_insert
  before insert on public.doctor_referrals
  for each row execute function public.match_doctor_referral_on_insert();

-- 2. Link any still-pending referrals the moment a matching patient signs up
-- later — this is what makes "refer someone who doesn't have an account
-- yet" actually work, not just "refer someone who already does."
create or replace function public.link_pending_referrals_on_signup()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role = 'patient' then
    update public.doctor_referrals
    set patient_id = new.id
    where patient_id is null and lower(patient_email) = lower(new.email);

    if found then
      insert into public.notifications (user_id, type, title, message)
      select new.id, 'referral_received', 'You have a referral waiting',
             'A referring doctor has already referred you for an MRI — you can book anytime.'
      where exists (
        select 1 from public.doctor_referrals
        where patient_id = new.id and used_in_appointment_id is null
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_link_doctor_referrals_on_profile_insert on public.profiles;
create trigger trg_link_doctor_referrals_on_profile_insert
  after insert on public.profiles
  for each row execute function public.link_pending_referrals_on_signup();

drop trigger if exists trg_doctor_referrals_audit on public.doctor_referrals;
create trigger trg_doctor_referrals_audit
  after insert or update on public.doctor_referrals
  for each row execute function public.write_audit();

-- ----------------------------------------------------------------------------
-- ROW-LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.doctor_referrals enable row level security;

drop policy if exists "doctor_referrals_doctor_insert" on public.doctor_referrals;
create policy "doctor_referrals_doctor_insert" on public.doctor_referrals
  for insert with check (referring_doctor_id = auth.uid());

drop policy if exists "doctor_referrals_read" on public.doctor_referrals;
create policy "doctor_referrals_read" on public.doctor_referrals
  for select using (
    referring_doctor_id = auth.uid()
    or patient_id = auth.uid()
    or public.is_staff()
  );

-- Lets a patient mark their own matched referral as used the moment they
-- book with it (setting used_in_appointment_id) — see the column-level
-- caveat noted on the table above.
drop policy if exists "doctor_referrals_patient_mark_used" on public.doctor_referrals;
create policy "doctor_referrals_patient_mark_used" on public.doctor_referrals
  for update using (patient_id = auth.uid()) with check (patient_id = auth.uid());

drop policy if exists "doctor_referrals_staff_all" on public.doctor_referrals;
create policy "doctor_referrals_staff_all" on public.doctor_referrals
  for all using (public.is_staff()) with check (public.is_staff());

-- ============================================================================
-- END OF MIGRATION 006
-- ============================================================================
