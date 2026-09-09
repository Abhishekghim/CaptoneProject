-- ============================================================================
-- CAPITAL RADIOLOGY — Online MRI Management System
-- Complete PostgreSQL / Supabase Schema  (Project 24, T2 2026)
-- Run in Supabase SQL Editor. Idempotent-safe: drops nothing, uses IF NOT EXISTS
-- where possible. Requires the default `auth` schema (Supabase Auth).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ----------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('patient', 'technician', 'radiologist', 'admin');
exception when duplicate_object then null; end $$;

-- referring_doctor added post-launch (SRS 7.1 use case): can upload a
-- referral and view the finalized report for patients that named them as
-- referring doctor at booking. Not "staff" — see is_staff() below, and the
-- referring-doctor-specific policies added in section 5.
alter type user_role add value if not exists 'referring_doctor';

do $$ begin
  create type appointment_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_status as enum ('draft', 'finalized');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'paid', 'insurance_review', 'refunded', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type equipment_status as enum ('operational', 'maintenance', 'offline', 'calibration_due');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. TABLES
-- ----------------------------------------------------------------------------

-- 2.1 profiles — mirrors auth.users, holds role for RBAC (FR1–FR5, FR49–FR50)
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  role        user_role not null default 'patient',
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2.2 patient_medical_records (FR11–FR15)
create table if not exists public.patient_medical_records (
  id                 uuid primary key default uuid_generate_v4(),
  patient_id         uuid not null unique references public.profiles (id) on delete cascade,
  dob                date not null,
  history            text,
  contraindications  jsonb not null default '{"metal_implants": false, "pacemaker": false, "claustrophobia": false, "contrast_allergy": false, "pregnancy": false, "other": null}'::jsonb,
  emergency_contact  jsonb not null default '{"name": null, "relationship": null, "phone": null}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint dob_in_past check (dob < current_date)
);

-- 2.2b clinics — added post-launch to close the SRS ERD gap (previously just
-- a free-text `location` on appointments). See the note on `clinic_id` below.
create table if not exists public.clinics (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  address     text,
  phone       text,
  created_at  timestamptz not null default now()
);

-- 2.3 appointments (FR6–FR10, FR16–FR19)
create table if not exists public.appointments (
  id            uuid primary key default uuid_generate_v4(),
  patient_id    uuid not null references public.profiles (id) on delete cascade,
  date          date not null,
  time_slot     text not null,
  location      text not null,
  body_part     text not null,
  status        appointment_status not null default 'scheduled',
  referral_url  text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint no_double_booking unique (date, time_slot, location)
);

-- Added post-launch: referring doctor linkage (SRS 7.1) and a normalized
-- clinic reference. `location` (free text) is kept as-is so the existing
-- booking flow keeps working; `clinic_id` is available once callers are
-- updated to look up public.clinics instead of typing a location string.
alter table public.appointments add column if not exists referring_doctor_id uuid references public.profiles (id) on delete set null;
alter table public.appointments add column if not exists clinic_id uuid references public.clinics (id) on delete set null;

-- 2.4 mri_scans (FR20–FR28)
create table if not exists public.mri_scans (
  id               uuid primary key default uuid_generate_v4(),
  appointment_id   uuid not null unique references public.appointments (id) on delete cascade,
  body_part        text not null,
  protocol         text not null,
  scan_duration    integer,                       -- minutes
  technician_id    uuid references public.profiles (id) on delete set null,
  machine_name     text,
  dicom_image_url  text,
  performed_at     timestamptz,
  created_at       timestamptz not null default now(),
  constraint positive_duration check (scan_duration is null or scan_duration > 0)
);

-- 2.5 radiology_reports (FR29–FR33)
create table if not exists public.radiology_reports (
  id              uuid primary key default uuid_generate_v4(),
  scan_id         uuid not null unique references public.mri_scans (id) on delete cascade,
  radiologist_id  uuid not null references public.profiles (id) on delete restrict,
  findings        text not null default '',
  impression      text not null default '',
  status          report_status not null default 'draft',
  e_signature     text,                            -- typed legal signature at finalization
  finalized_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint signature_required_when_final
    check (status = 'draft' or (e_signature is not null and finalized_at is not null))
);

-- 2.6 billing (FR34–FR38)
create table if not exists public.billing (
  id              uuid primary key default uuid_generate_v4(),
  appointment_id  uuid not null unique references public.appointments (id) on delete cascade,
  amount          numeric(10,2) not null check (amount >= 0),
  payment_status  payment_status not null default 'pending',
  payment_method  text,                            -- 'card' | 'insurance'
  insurance_ref   text,
  receipt_url     text,
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- 2.7 equipment_logs (FR53–FR56)
create table if not exists public.equipment_logs (
  id                uuid primary key default uuid_generate_v4(),
  machine_name      text not null,
  model             text,
  status            equipment_status not null default 'operational',
  last_calibration  date,
  maintenance_due   date,
  usage_hours       integer not null default 0,
  service_notes     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 2.8 audit_logs (FR52, FR70–FR74, NFR9, NFR28)
create table if not exists public.audit_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  action     text not null,                        -- e.g. 'LOGIN', 'REPORT_FINALIZED'
  entity     text,                                 -- table / resource touched
  entity_id  text,
  details    jsonb not null default '{}'::jsonb,
  ip_address inet,
  timestamp  timestamptz not null default now()
);

-- 2.9 mri_images — an MRI scan has many images (SRS 8.3); mri_scans.dicom_image_url
-- stays as the single representative/preview image for backward compatibility.
create table if not exists public.mri_images (
  id               uuid primary key default uuid_generate_v4(),
  scan_id          uuid not null references public.mri_scans (id) on delete cascade,
  image_url        text not null,
  sequence_number  integer not null default 1,
  created_at       timestamptz not null default now()
);

-- 2.10 notifications — email/SMS/in-app alerts module (SRS core module).
-- Rows are written only by the security-definer triggers in section 4.5
-- below, never inserted directly by a client — see the RLS notes in
-- section 5 for why that matters.
create table if not exists public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,
  title       text not null,
  message     text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 2.11 invoices — the issued billing document, distinct from `billing`
-- (which tracks payment status). One invoice per billing row.
create table if not exists public.invoices (
  id              uuid primary key default uuid_generate_v4(),
  billing_id      uuid not null unique references public.billing (id) on delete cascade,
  invoice_number  text not null unique,
  issued_at       timestamptz not null default now(),
  pdf_url         text,
  line_items      jsonb not null default '[]'::jsonb
);

-- 2.12 / 2.13 radiologist_details, technician_details — role-specific fields
-- split out of `profiles` (which stays the single RBAC-linked identity row
-- required for the auth.users FK and get_user_role()).
create table if not exists public.radiologist_details (
  profile_id      uuid primary key references public.profiles (id) on delete cascade,
  license_number  text,
  specialty       text
);

create table if not exists public.technician_details (
  profile_id     uuid primary key references public.profiles (id) on delete cascade,
  certification  text
);

-- ----------------------------------------------------------------------------
-- 3. INDEXES (NFR1, NFR3 — fast search on appointments, patients, reports)
-- ----------------------------------------------------------------------------
create index if not exists idx_appointments_patient   on public.appointments (patient_id);
create index if not exists idx_appointments_date      on public.appointments (date, status);
create index if not exists idx_scans_technician       on public.mri_scans (technician_id);
create index if not exists idx_reports_status         on public.radiology_reports (status);
create index if not exists idx_reports_radiologist    on public.radiology_reports (radiologist_id);
create index if not exists idx_billing_status         on public.billing (payment_status);
create index if not exists idx_audit_user_time        on public.audit_logs (user_id, timestamp desc);
create index if not exists idx_audit_time             on public.audit_logs (timestamp desc);
create index if not exists idx_appts_referring_doctor on public.appointments (referring_doctor_id);
create index if not exists idx_mri_images_scan        on public.mri_images (scan_id, sequence_number);
create index if not exists idx_notifications_user     on public.notifications (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 4. HELPER FUNCTIONS & TRIGGERS
-- ----------------------------------------------------------------------------

-- 4.1 Current user's role (security definer avoids RLS recursion on profiles)
create or replace function public.get_user_role()
returns user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.get_user_role() in ('technician', 'radiologist', 'admin');
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.get_user_role() = 'admin';
$$;

-- 4.2 Auto-create a profile row when a user signs up (FR1)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'patient')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4.3 updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_records_touch on public.patient_medical_records;
create trigger trg_records_touch before update on public.patient_medical_records
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_appts_touch on public.appointments;
create trigger trg_appts_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_reports_touch on public.radiology_reports;
create trigger trg_reports_touch before update on public.radiology_reports
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_equipment_touch on public.equipment_logs;
create trigger trg_equipment_touch before update on public.equipment_logs
  for each row execute function public.touch_updated_at();

-- 4.4 Automatic audit trail on sensitive tables (FR72, FR74)
create or replace function public.write_audit()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_logs (user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    tg_op || '_' || upper(tg_table_name),
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id::text else new.id::text end), 'n/a'),
    case when tg_op = 'DELETE'
         then jsonb_build_object('old', to_jsonb(old))
         else jsonb_build_object('new', to_jsonb(new))
    end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_reports on public.radiology_reports;
create trigger trg_audit_reports
  after insert or update or delete on public.radiology_reports
  for each row execute function public.write_audit();

drop trigger if exists trg_audit_billing on public.billing;
create trigger trg_audit_billing
  after insert or update or delete on public.billing
  for each row execute function public.write_audit();

drop trigger if exists trg_audit_records on public.patient_medical_records;
create trigger trg_audit_records
  after insert or update or delete on public.patient_medical_records
  for each row execute function public.write_audit();

-- 4.5 Notifications module — real events write a real notification row via
-- security-definer triggers (same pattern as write_audit() above), so a
-- client can never forge a notification as coming from someone else. This
-- is the in-app half of the module; wiring these to an actual email/SMS
-- provider is a separate integration (e.g. a Supabase Edge Function
-- subscribed to these inserts) layered on top, not a schema change.
create or replace function public.notify_on_appointment_booked()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, message)
  values (
    new.patient_id,
    'appointment_booked',
    'Appointment booked',
    new.body_part || ' MRI on ' || to_char(new.date, 'DD Mon YYYY') || ' at ' || new.time_slot
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_appointment_booked on public.appointments;
create trigger trg_notify_appointment_booked
  after insert on public.appointments
  for each row execute function public.notify_on_appointment_booked();

create or replace function public.notify_on_report_finalized()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_patient_id uuid;
  v_body_part  text;
begin
  if new.status = 'finalized' and old.status is distinct from 'finalized' then
    select a.patient_id, s.body_part into v_patient_id, v_body_part
    from public.mri_scans s
    join public.appointments a on a.id = s.appointment_id
    where s.id = new.scan_id;

    if v_patient_id is not null then
      insert into public.notifications (user_id, type, title, message)
      values (
        v_patient_id,
        'report_ready',
        'Your MRI report is ready',
        'Your ' || coalesce(v_body_part, '') || ' MRI report has been finalized.'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_report_finalized on public.radiology_reports;
create trigger trg_notify_report_finalized
  after update on public.radiology_reports
  for each row execute function public.notify_on_report_finalized();

create or replace function public.notify_on_payment_received()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_patient_id uuid;
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    select a.patient_id into v_patient_id
    from public.appointments a
    where a.id = new.appointment_id;

    if v_patient_id is not null then
      insert into public.notifications (user_id, type, title, message)
      values (v_patient_id, 'payment_received', 'Payment received', 'We''ve received your payment and your receipt is ready.');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_payment on public.billing;
create trigger trg_notify_payment
  after update on public.billing
  for each row execute function public.notify_on_payment_received();

-- ----------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY (FR5, FR73, NFR8)
-- ----------------------------------------------------------------------------
alter table public.profiles                enable row level security;
alter table public.patient_medical_records enable row level security;
alter table public.appointments            enable row level security;
alter table public.mri_scans               enable row level security;
alter table public.radiology_reports       enable row level security;
alter table public.billing                 enable row level security;
alter table public.equipment_logs          enable row level security;
alter table public.audit_logs              enable row level security;
alter table public.clinics                 enable row level security;
alter table public.mri_images              enable row level security;
alter table public.notifications           enable row level security;
alter table public.invoices                enable row level security;
alter table public.radiologist_details     enable row level security;
alter table public.technician_details      enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff" on public.profiles
  for select using (id = auth.uid() or public.is_staff());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles p where p.id = auth.uid()));

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- patient_medical_records ---------------------------------------------------
drop policy if exists "records_patient_read_own" on public.patient_medical_records;
create policy "records_patient_read_own" on public.patient_medical_records
  for select using (patient_id = auth.uid() or public.is_staff());

drop policy if exists "records_patient_upsert_own" on public.patient_medical_records;
create policy "records_patient_upsert_own" on public.patient_medical_records
  for insert with check (patient_id = auth.uid() or public.is_admin());

drop policy if exists "records_patient_update_own" on public.patient_medical_records;
create policy "records_patient_update_own" on public.patient_medical_records
  for update using (patient_id = auth.uid() or public.is_staff())
  with check (patient_id = auth.uid() or public.is_staff());

-- appointments --------------------------------------------------------------
drop policy if exists "appts_patient_read_own" on public.appointments;
create policy "appts_patient_read_own" on public.appointments
  for select using (patient_id = auth.uid() or public.is_staff());

drop policy if exists "appts_patient_create_own" on public.appointments;
create policy "appts_patient_create_own" on public.appointments
  for insert with check (patient_id = auth.uid() or public.is_staff());

drop policy if exists "appts_patient_cancel_own" on public.appointments;
create policy "appts_patient_cancel_own" on public.appointments
  for update using (patient_id = auth.uid() or public.is_staff())
  with check (patient_id = auth.uid() or public.is_staff());

drop policy if exists "appts_staff_delete" on public.appointments;
create policy "appts_staff_delete" on public.appointments
  for delete using (public.is_admin());

-- Referring doctors (SRS 7.1): read-only visibility into appointments where
-- they're the named referring doctor, plus permission to attach/update the
-- referral document on exactly those rows. Not "staff" — is_staff() does
-- not include this role, so they get no broader access.
drop policy if exists "appts_referring_doctor_read" on public.appointments;
create policy "appts_referring_doctor_read" on public.appointments
  for select using (referring_doctor_id = auth.uid());

-- Caveat: Postgres RLS is row-level, not column-level, so this technically
-- lets a referring doctor update any column on their linked appointment
-- rows (not just referral_url). Acceptable for now since the only UI path
-- that uses this policy only ever touches referral_url; if that changes,
-- restrict it properly with column-level GRANTs or a dedicated RPC function.
drop policy if exists "appts_referring_doctor_update_referral" on public.appointments;
create policy "appts_referring_doctor_update_referral" on public.appointments
  for update using (referring_doctor_id = auth.uid())
  with check (referring_doctor_id = auth.uid());

-- mri_scans -----------------------------------------------------------------
drop policy if exists "scans_read" on public.mri_scans;
create policy "scans_read" on public.mri_scans
  for select using (
    public.is_staff()
    or exists (select 1 from public.appointments a
               where a.id = appointment_id and a.patient_id = auth.uid())
  );

drop policy if exists "scans_staff_write" on public.mri_scans;
create policy "scans_staff_write" on public.mri_scans
  for all using (public.is_staff()) with check (public.is_staff());

-- radiology_reports ---------------------------------------------------------
-- Patients (and their referring doctor, if any) may only see FINALIZED
-- reports for their own scans (FR33, FR44; SRS 7.1 for the doctor branch)
drop policy if exists "reports_patient_read_finalized" on public.radiology_reports;
create policy "reports_patient_read_finalized" on public.radiology_reports
  for select using (
    public.is_staff()
    or (
      status = 'finalized'
      and exists (
        select 1
        from public.mri_scans s
        join public.appointments a on a.id = s.appointment_id
        where s.id = scan_id and (a.patient_id = auth.uid() or a.referring_doctor_id = auth.uid())
      )
    )
  );

drop policy if exists "reports_radiologist_write" on public.radiology_reports;
create policy "reports_radiologist_write" on public.radiology_reports
  for all
  using (public.get_user_role() in ('radiologist', 'admin'))
  with check (public.get_user_role() in ('radiologist', 'admin'));

-- billing -------------------------------------------------------------------
drop policy if exists "billing_patient_read_own" on public.billing;
create policy "billing_patient_read_own" on public.billing
  for select using (
    public.is_staff()
    or exists (select 1 from public.appointments a
               where a.id = appointment_id and a.patient_id = auth.uid())
  );

drop policy if exists "billing_admin_write" on public.billing;
create policy "billing_admin_write" on public.billing
  for all using (public.is_admin()) with check (public.is_admin());

-- equipment_logs ------------------------------------------------------------
drop policy if exists "equipment_staff_read" on public.equipment_logs;
create policy "equipment_staff_read" on public.equipment_logs
  for select using (public.is_staff());

drop policy if exists "equipment_admin_write" on public.equipment_logs;
create policy "equipment_admin_write" on public.equipment_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- audit_logs ----------------------------------------------------------------
-- Append-only. Admin reads; nobody updates or deletes (NFR28 retention).
drop policy if exists "audit_admin_read" on public.audit_logs;
create policy "audit_admin_read" on public.audit_logs
  for select using (public.is_admin());

drop policy if exists "audit_insert_any_authed" on public.audit_logs;
create policy "audit_insert_any_authed" on public.audit_logs
  for insert with check (auth.uid() is not null);

-- clinics ---------------------------------------------------------------
drop policy if exists "clinics_read_any_authed" on public.clinics;
create policy "clinics_read_any_authed" on public.clinics
  for select using (auth.uid() is not null);

drop policy if exists "clinics_admin_write" on public.clinics;
create policy "clinics_admin_write" on public.clinics
  for all using (public.is_admin()) with check (public.is_admin());

-- mri_images --------------------------------------------------------------
drop policy if exists "mri_images_read" on public.mri_images;
create policy "mri_images_read" on public.mri_images
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.mri_scans s
      join public.appointments a on a.id = s.appointment_id
      where s.id = scan_id and a.patient_id = auth.uid()
    )
  );

drop policy if exists "mri_images_staff_write" on public.mri_images;
create policy "mri_images_staff_write" on public.mri_images
  for all using (public.is_staff()) with check (public.is_staff());

-- notifications ---------------------------------------------------------
-- No client-facing insert policy at all — rows only ever come from the
-- security-definer triggers in section 4.5, same reasoning as audit_logs
-- should have had: a client that could insert its own notifications could
-- forge one as coming from the system, or spam another user_id.
drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own" on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists "notifications_mark_read_own" on public.notifications;
create policy "notifications_mark_read_own" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- invoices ----------------------------------------------------------------
drop policy if exists "invoices_read" on public.invoices;
create policy "invoices_read" on public.invoices
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.billing b
      join public.appointments a on a.id = b.appointment_id
      where b.id = billing_id and a.patient_id = auth.uid()
    )
  );

drop policy if exists "invoices_admin_write" on public.invoices;
create policy "invoices_admin_write" on public.invoices
  for all using (public.is_admin()) with check (public.is_admin());

-- radiologist_details / technician_details ---------------------------------
drop policy if exists "radiologist_details_read" on public.radiologist_details;
create policy "radiologist_details_read" on public.radiologist_details
  for select using (profile_id = auth.uid() or public.is_staff());

drop policy if exists "radiologist_details_write" on public.radiologist_details;
create policy "radiologist_details_write" on public.radiologist_details
  for all using (profile_id = auth.uid() or public.is_admin()) with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "technician_details_read" on public.technician_details;
create policy "technician_details_read" on public.technician_details
  for select using (profile_id = auth.uid() or public.is_staff());

drop policy if exists "technician_details_write" on public.technician_details;
create policy "technician_details_write" on public.technician_details
  for all using (profile_id = auth.uid() or public.is_admin()) with check (profile_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. STORAGE BUCKETS (referrals, DICOM images, receipts)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('referrals', 'referrals', false),
  ('dicom',     'dicom',     false),
  ('receipts',  'receipts',  false)
on conflict (id) do nothing;

drop policy if exists "referrals_owner_rw" on storage.objects;
create policy "referrals_owner_rw" on storage.objects
  for all using (
    bucket_id = 'referrals'
    and (owner = auth.uid() or public.is_staff())
  )
  with check (bucket_id = 'referrals' and (owner = auth.uid() or public.is_staff()));

drop policy if exists "dicom_staff_rw_patient_r" on storage.objects;
create policy "dicom_staff_rw_patient_r" on storage.objects
  for select using (bucket_id = 'dicom' and (public.is_staff() or owner = auth.uid()));

drop policy if exists "dicom_staff_write" on storage.objects;
create policy "dicom_staff_write" on storage.objects
  for insert with check (bucket_id = 'dicom' and public.is_staff());

drop policy if exists "receipts_read" on storage.objects;
create policy "receipts_read" on storage.objects
  for select using (bucket_id = 'receipts' and (public.is_staff() or owner = auth.uid()));

-- ----------------------------------------------------------------------------
-- 7. SEED DATA — equipment fleet, clinics (demo)
-- ----------------------------------------------------------------------------
insert into public.clinics (name, address, phone) values
  ('Sydney CBD Clinic', '1 Market St, Sydney NSW', '+61 2 8000 1000'),
  ('Parramatta Imaging', '10 Church St, Parramatta NSW', '+61 2 8000 2000'),
  ('Chatswood Centre', '5 Victoria Ave, Chatswood NSW', '+61 2 8000 3000')
on conflict (name) do nothing;

insert into public.equipment_logs (machine_name, model, status, last_calibration, maintenance_due, usage_hours)
values
  ('MRI Suite A — 3T', 'Siemens MAGNETOM Vida', 'operational',     current_date - 21, current_date + 40, 4210),
  ('MRI Suite B — 1.5T', 'GE SIGNA Explorer',   'operational',     current_date - 60, current_date + 12, 6120),
  ('MRI Suite C — 3T', 'Philips Ingenia Elition','calibration_due', current_date - 95, current_date + 2,  7480),
  ('Mobile Unit 1 — 1.5T', 'Siemens MAGNETOM Free.Max', 'maintenance', current_date - 30, current_date - 1, 2890)
on conflict do nothing;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
