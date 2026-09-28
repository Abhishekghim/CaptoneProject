-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 037: referral approval workflow for bookings
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-036 if used).
--
-- Which bookings need approval is unchanged from 033: a patient's own
-- booking needs review when the body part requires clinical sign-off
-- (body_part_requires_review) or a doctor/referral is involved.
--
-- Review states, kept separate from `confirmed`:
--   not_required   - no review needed (self-referred Shoulder/Knee, or booked
--                    by staff); confirmed immediately
--   pending        - slot reserved, waiting for approval
--   approved       - confirmed by the reviewing doctor or clinic staff
--   auto_confirmed - confirmed at booking because an external doctor's
--                    referral matched the patient (rules below)
--   declined       - not approved; booking cancelled, slot released
--
-- Clinic policy:
--   * External referring doctors (registered through the request-and-approve
--     queue, so they have a referring_doctor_details row) send referrals with
--     the document attached. Those referrals are valid for 24 hours. A patient
--     booking inside that window auto-confirms when the doctor matches (picked
--     from the list, or name + practice typed in) and the patient's name, date
--     of birth and verified phone number all match the referral. Anything less
--     than one exact match goes to manual review.
--   * Internal referring doctors (created by super_admin, no details row) are
--     notified and approve or decline their own patients' bookings. The
--     patient doesn't upload a referral for them.
--   * Everything else goes to reception/admin/super_admin, who can also act on
--     any pending booking as cover.
--   * Nobody can change `confirmed` or the review columns by editing the row
--     directly — only through book_appointment / review_booking.
--   * A scan can't be started or logged on a booking that isn't confirmed.
--
-- There is no expiry for pending reservations — no policy exists for one, so
-- a pending slot stays held until someone decides or the patient cancels.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Review state columns
-- ----------------------------------------------------------------------------
alter table public.appointments add column if not exists booking_review_status text not null default 'not_required';
alter table public.appointments add column if not exists booking_reviewed_by uuid references public.profiles (id) on delete set null;
alter table public.appointments add column if not exists booking_reviewed_at timestamptz;
alter table public.appointments add column if not exists booking_review_reason text;

do $$ begin
  alter table public.appointments add constraint booking_review_status_valid
    check (booking_review_status in ('not_required', 'pending', 'approved', 'auto_confirmed', 'declined'));
exception when duplicate_object then null; end $$;

-- Bookings that were already waiting on reception under 033 become pending
-- reviews, so they show up in the new review queue.
update public.appointments
set booking_review_status = 'pending'
where confirmed = false and status = 'scheduled' and booking_review_status = 'not_required';

do $$ begin
  alter table public.appointments add constraint booking_review_matches_confirmed check (
    (booking_review_status in ('pending', 'declined') and confirmed = false)
    or (booking_review_status in ('approved', 'auto_confirmed') and confirmed = true)
    or booking_review_status = 'not_required'
  );
exception when duplicate_object then null; end $$;

create index if not exists idx_appointments_pending_review
  on public.appointments (date, time_slot) where booking_review_status = 'pending';

-- ----------------------------------------------------------------------------
-- 2. Slot uniqueness. Same rule as no_double_booking, except a declined
-- booking no longer holds its slot. Cancelled bookings still do, as before.
-- The unique index is what makes two simultaneous bookings for one slot
-- impossible: the second insert fails inside the database.
-- ----------------------------------------------------------------------------
alter table public.appointments drop constraint if exists no_double_booking;
create unique index if not exists appointments_active_slot_unique
  on public.appointments (date, time_slot, location)
  where booking_review_status <> 'declined';

create or replace function public.get_taken_slots(p_date date, p_location text)
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(time_slot), '{}')
  from public.appointments
  where date = p_date and location = p_location and booking_review_status <> 'declined';
$$;

revoke all on function public.get_taken_slots(date, text) from public;
grant execute on function public.get_taken_slots(date, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Doctor referrals carry the document and the patient's phone, which the
-- auto-confirm match needs.
-- ----------------------------------------------------------------------------
alter table public.doctor_referrals add column if not exists patient_phone text;
alter table public.doctor_referrals add column if not exists referral_url text;

create or replace function public.referral_valid_hours()
returns integer language sql immutable as $$ select 24 $$;

-- Comparison keys: case, punctuation and a leading "Dr" don't matter for
-- names; phones compare on their last 9 digits so 04xx and +614xx agree.
create or replace function public.name_key(p text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    regexp_replace(regexp_replace(lower(coalesce(p, '')), '^\s*dr\.?\s+', ''), '[^a-z ]', '', 'g'),
    '\s+', ' ', 'g'))
$$;

create or replace function public.phone_key(p text)
returns text language sql immutable as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9)
$$;

-- ----------------------------------------------------------------------------
-- 4. Who can review
-- ----------------------------------------------------------------------------
create or replace function public.can_review_bookings()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.get_user_role()::text in ('reception', 'admin', 'super_admin'), false);
$$;

-- Internal = a referring_doctor account created by super_admin, i.e. with no
-- referring_doctor_details row (same definition as 009's image release).
create or replace function public.is_internal_referring_doctor(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.role::text = 'referring_doctor' and p.is_active
      and not exists (select 1 from public.referring_doctor_details d where d.profile_id = p.id)
  );
$$;

-- An internal doctor reviewing their patient's booking needs the patient's
-- health record and the uploaded referral, same as clinic reviewers.
drop policy if exists "records_internal_referring_doctor_read" on public.patient_medical_records;
create policy "records_internal_referring_doctor_read" on public.patient_medical_records
  for select using (
    public.is_internal_referring_doctor(auth.uid())
    and exists (
      select 1 from public.appointments a
      where a.patient_id = patient_medical_records.patient_id and a.referring_doctor_id = auth.uid()
    )
  );

drop policy if exists "referrals_internal_referring_doctor_read" on storage.objects;
create policy "referrals_internal_referring_doctor_read" on storage.objects
  for select using (
    bucket_id = 'referrals'
    and public.is_internal_referring_doctor(auth.uid())
    and exists (
      select 1 from public.appointments a
      where a.referring_doctor_id = auth.uid() and a.referral_url = 'referrals/' || storage.objects.name
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Idempotent notifications. appointment_id lets a notification about one
-- booking be written at most once per recipient and type.
-- ----------------------------------------------------------------------------
alter table public.notifications add column if not exists appointment_id uuid references public.appointments (id) on delete cascade;
create unique index if not exists notifications_once_per_appointment
  on public.notifications (user_id, type, appointment_id)
  where appointment_id is not null;

create or replace function public.notify_on_appointment_booked()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_when text := new.body_part || ' MRI on ' || to_char(new.date, 'DD Mon YYYY') || ' at ' || new.time_slot;
begin
  if new.booking_review_status = 'pending' then
    insert into public.notifications (user_id, type, title, message, appointment_id)
    values (
      new.patient_id, 'appointment_reserved', 'Appointment time reserved',
      v_when || ' is reserved while your referral is checked. It is not confirmed yet — we''ll let you know once it has been reviewed.',
      new.id
    )
    on conflict (user_id, type, appointment_id) where appointment_id is not null do nothing;

    -- Only what the reviewer needs to find the booking; patient details stay
    -- on the protected review screen.
    insert into public.notifications (user_id, type, title, message, appointment_id)
    select p.id, 'booking_review_requested', 'Booking waiting for your approval',
           v_when || ' at ' || new.location || '. Open Booking approvals to approve or decline.',
           new.id
    from public.profiles p
    where case
            when public.is_internal_referring_doctor(new.referring_doctor_id) then p.id = new.referring_doctor_id
            else p.role::text in ('reception', 'admin', 'super_admin') and p.is_active
          end
    on conflict (user_id, type, appointment_id) where appointment_id is not null do nothing;
  else
    insert into public.notifications (user_id, type, title, message, appointment_id)
    values (new.patient_id, 'appointment_booked', 'Appointment booked', v_when, new.id)
    on conflict (user_id, type, appointment_id) where appointment_id is not null do nothing;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Guard: review columns only change through book_appointment /
-- review_booking. Those run as SECURITY DEFINER, so current_user is the
-- function owner there, not the API role. Plain SECURITY INVOKER here on
-- purpose, so current_user reflects the real caller.
-- ----------------------------------------------------------------------------
create or replace function public.guard_booking_review_fields()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      -- A direct insert (bypassing book_appointment) can never self-confirm.
      new.confirmed := false;
      new.booking_review_status := 'pending';
      new.booking_reviewed_by := null;
      new.booking_reviewed_at := null;
      new.booking_review_reason := null;
    elsif (new.confirmed, new.booking_review_status, new.booking_reviewed_by, new.booking_reviewed_at, new.booking_review_reason)
          is distinct from
          (old.confirmed, old.booking_review_status, old.booking_reviewed_by, old.booking_reviewed_at, old.booking_review_reason) then
      raise exception 'Booking confirmation can only be changed through the booking review workflow.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'scheduled'
     and new.status in ('in_progress', 'completed')
     and not new.confirmed then
    raise exception 'This booking is waiting for referral approval and cannot be scanned yet.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_appts_guard_booking_review on public.appointments;
create trigger trg_appts_guard_booking_review
  before insert or update on public.appointments
  for each row execute function public.guard_booking_review_fields();

-- ----------------------------------------------------------------------------
-- 7. book_appointment — replaces 033's version. SECURITY DEFINER (to set the
-- review columns past the guard, and to search external doctors' referrals
-- the patient can't read), so it checks the caller itself. p_other_doctor
-- marks "My doctor isn't listed" even when the name/practice are left blank.
-- ----------------------------------------------------------------------------
drop function if exists public.book_appointment(uuid, date, text, text, text, uuid, text, text, text, numeric, text, uuid);

create or replace function public.book_appointment(
  p_patient_id uuid,
  p_date date,
  p_time_slot text,
  p_location text,
  p_body_part text,
  p_referring_doctor_id uuid,
  p_referring_doctor_name text,
  p_referring_doctor_practice text,
  p_referral_url text,
  p_amount numeric,
  p_payment_type text,
  p_referral_id uuid default null,
  p_other_doctor boolean default false
)
returns public.appointments
language plpgsql security definer set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_staff_booked boolean;
  v_appointment public.appointments;
  v_referral public.doctor_referrals;
  v_doctor_id uuid := p_referring_doctor_id;
  v_doctor_name text := nullif(btrim(coalesce(p_referring_doctor_name, '')), '');
  v_doctor_practice text := nullif(btrim(coalesce(p_referring_doctor_practice, '')), '');
  v_referral_url text := nullif(btrim(coalesce(p_referral_url, '')), '');
  v_patient_name text;
  v_patient_phone text;
  v_patient_dob date;
  v_match_count integer;
  v_match_id uuid;
  v_auto_confirm boolean := false;
  v_doctor_involved boolean;
  v_review_status text;
begin
  if v_caller is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  v_staff_booked := p_patient_id is distinct from v_caller;
  if v_staff_booked and not public.is_staff() then
    raise exception 'You can only book appointments for yourself.' using errcode = '42501';
  end if;

  -- A patient can only attach a document from their own referrals folder.
  if not v_staff_booked and v_referral_url is not null
     and v_referral_url not like 'referrals/' || p_patient_id::text || '/%' then
    raise exception 'The referral document could not be verified. Please upload it again.';
  end if;

  if v_doctor_id is not null
     and not exists (select 1 from public.profiles d where d.id = v_doctor_id and d.role::text = 'referring_doctor') then
    raise exception 'That referring doctor could not be found.';
  end if;

  select full_name, phone into v_patient_name, v_patient_phone from public.profiles where id = p_patient_id;
  select dob into v_patient_dob from public.patient_medical_records where patient_id = p_patient_id;

  if p_referral_id is not null then
    -- The patient chose a referral already linked to their account (006).
    select * into v_referral from public.doctor_referrals where id = p_referral_id for update;
    if v_referral.id is null or v_referral.patient_id is distinct from p_patient_id then
      raise exception 'Referral not found or you do not have permission to use it.';
    end if;
    if v_referral.used_in_appointment_id is not null then
      raise exception 'This referral has already been used for another booking.';
    end if;
  elsif not v_staff_booked and (v_doctor_id is not null or v_doctor_name is not null) then
    -- Look for the external doctor's referral for this patient. Exactly one
    -- candidate must match; two or more is ambiguous and goes to review.
    select count(*), (array_agg(r.id))[1] into v_match_count, v_match_id
    from public.doctor_referrals r
    join public.profiles d on d.id = r.referring_doctor_id
    join public.referring_doctor_details dd on dd.profile_id = d.id
    where r.used_in_appointment_id is null
      and r.body_part = p_body_part
      and r.referral_url is not null
      and r.created_at > now() - make_interval(hours => public.referral_valid_hours())
      and d.is_active
      and case
            when v_doctor_id is not null then r.referring_doctor_id = v_doctor_id
            else public.name_key(d.full_name) = public.name_key(v_doctor_name)
                 and public.name_key(dd.practice_name) = public.name_key(v_doctor_practice)
          end
      and public.name_key(r.patient_full_name) = public.name_key(v_patient_name)
      and r.patient_dob = v_patient_dob
      and length(public.phone_key(v_patient_phone)) = 9
      and public.phone_key(r.patient_phone) = public.phone_key(v_patient_phone);

    if v_match_count = 1 then
      select * into v_referral from public.doctor_referrals where id = v_match_id for update;
    end if;
  end if;

  if v_referral.id is not null then
    v_doctor_id := v_referral.referring_doctor_id;
    v_doctor_name := null;
    v_doctor_practice := null;
    v_referral_url := coalesce(v_referral_url, v_referral.referral_url);

    -- Auto-confirm only for an external doctor's referral that is still
    -- inside its validity window, has the document, and matches this
    -- patient's name, DOB and verified phone for this scan.
    v_auto_confirm := not v_staff_booked
      and not public.is_internal_referring_doctor(v_referral.referring_doctor_id)
      and exists (select 1 from public.referring_doctor_details dd where dd.profile_id = v_referral.referring_doctor_id)
      and exists (select 1 from public.profiles d where d.id = v_referral.referring_doctor_id and d.is_active)
      and v_referral.body_part = p_body_part
      and v_referral.referral_url is not null
      and v_referral.created_at > now() - make_interval(hours => public.referral_valid_hours())
      and public.name_key(v_referral.patient_full_name) = public.name_key(v_patient_name)
      and (v_referral.patient_dob = v_patient_dob) is true
      and length(public.phone_key(v_patient_phone)) = 9
      and public.phone_key(v_referral.patient_phone) = public.phone_key(v_patient_phone);
  end if;

  if v_doctor_id is not null then
    v_doctor_name := null;
    v_doctor_practice := null;
  end if;

  v_doctor_involved := v_doctor_id is not null or v_doctor_name is not null or v_doctor_practice is not null
                       or p_other_doctor or v_referral.id is not null;

  if v_staff_booked then
    v_review_status := 'not_required';
  else
    -- An internal doctor approves the booking themselves, so the patient
    -- doesn't need to upload anything for them.
    if (public.body_part_requires_review(p_body_part) or v_doctor_involved)
       and v_referral.id is null and v_referral_url is null
       and not public.is_internal_referring_doctor(v_doctor_id) then
      raise exception 'Please attach your referral document — it is required for this booking.';
    end if;

    v_review_status := case
      when v_auto_confirm then 'auto_confirmed'
      when public.body_part_requires_review(p_body_part) or v_doctor_involved or v_referral_url is not null then 'pending'
      else 'not_required'
    end;
  end if;

  begin
    insert into public.appointments (
      patient_id, date, time_slot, location, body_part,
      referring_doctor_id, referring_doctor_name, referring_doctor_practice, referral_url,
      confirmed, booking_review_status
    ) values (
      p_patient_id, p_date, p_time_slot, p_location, p_body_part,
      v_doctor_id, v_doctor_name, v_doctor_practice, v_referral_url,
      v_review_status <> 'pending', v_review_status
    )
    returning * into v_appointment;
  exception when unique_violation then
    raise exception 'This time slot is already booked. Choose another time.' using errcode = 'unique_violation';
  end;

  insert into public.billing (appointment_id, amount, payment_status, payment_method)
  values (v_appointment.id, p_amount, 'pending', p_payment_type);

  if v_referral.id is not null then
    update public.doctor_referrals
    set used_in_appointment_id = v_appointment.id,
        patient_id = coalesce(patient_id, p_patient_id)
    where id = v_referral.id;
  end if;

  return v_appointment;
end;
$$;

revoke all on function public.book_appointment(uuid, date, text, text, text, uuid, text, text, text, numeric, text, uuid, boolean) from public;
grant execute on function public.book_appointment(uuid, date, text, text, text, uuid, text, text, text, numeric, text, uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. review_booking — the only way to approve or decline a pending booking.
-- Clinic reviewers can act on any; an internal referring doctor only on
-- bookings that name them. Row lock + status check make a repeated or
-- concurrent decision an error rather than a second change. The appointments
-- audit trigger (027) records the row change; the explicit audit row records
-- the decision.
-- ----------------------------------------------------------------------------
create or replace function public.review_booking(
  p_appointment_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.appointments
language plpgsql security definer set search_path = public
as $$
declare
  v_appointment public.appointments;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_when text;
begin
  if p_decision not in ('approve', 'decline') then
    raise exception 'Unknown review decision.';
  end if;

  select * into v_appointment from public.appointments where id = p_appointment_id for update;

  if not (
    public.can_review_bookings()
    or (v_appointment.referring_doctor_id = auth.uid() and public.is_internal_referring_doctor(auth.uid()))
  ) then
    raise exception 'Only clinic reviewers or the patient''s clinic doctor can approve or decline this booking.'
      using errcode = '42501';
  end if;

  if v_appointment.id is null then
    raise exception 'Appointment not found.';
  end if;
  if p_decision = 'decline' and v_reason is null then
    raise exception 'Give a reason for declining this booking.';
  end if;
  if v_appointment.booking_review_status <> 'pending' or v_appointment.status <> 'scheduled' then
    raise exception 'This booking is no longer waiting for review.';
  end if;

  v_when := v_appointment.body_part || ' MRI on ' || to_char(v_appointment.date, 'DD Mon YYYY') || ' at ' || v_appointment.time_slot;

  if p_decision = 'approve' then
    update public.appointments
    set confirmed = true,
        booking_review_status = 'approved',
        booking_reviewed_by = auth.uid(),
        booking_reviewed_at = now(),
        booking_review_reason = v_reason
    where id = p_appointment_id
    returning * into v_appointment;

    insert into public.notifications (user_id, type, title, message, appointment_id)
    values (v_appointment.patient_id, 'appointment_confirmed', 'Appointment confirmed',
            'Your referral has been checked. ' || v_when || ' at ' || v_appointment.location || ' is confirmed.',
            v_appointment.id)
    on conflict (user_id, type, appointment_id) where appointment_id is not null do nothing;
  else
    update public.appointments
    set confirmed = false,
        status = 'cancelled',
        booking_review_status = 'declined',
        booking_reviewed_by = auth.uid(),
        booking_reviewed_at = now(),
        booking_review_reason = v_reason,
        cancellation_reason = 'Referral not approved: ' || v_reason
    where id = p_appointment_id
    returning * into v_appointment;

    insert into public.notifications (user_id, type, title, message, appointment_id)
    values (v_appointment.patient_id, 'appointment_declined', 'Appointment not confirmed',
            v_when || ' could not be confirmed: ' || v_reason || ' The time has been released — please contact the clinic or book again.',
            v_appointment.id)
    on conflict (user_id, type, appointment_id) where appointment_id is not null do nothing;
  end if;

  -- The request is handled, so clear it from every reviewer's unread list.
  update public.notifications
  set read = true
  where appointment_id = p_appointment_id and type = 'booking_review_requested';

  insert into public.audit_logs (user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    case when p_decision = 'approve' then 'BOOKING_APPROVED' else 'BOOKING_DECLINED' end,
    'appointments',
    p_appointment_id::text,
    jsonb_build_object('reason', v_reason, 'patient_id', v_appointment.patient_id)
  );

  return v_appointment;
end;
$$;

revoke all on function public.review_booking(uuid, text, text) from public;
grant execute on function public.review_booking(uuid, text, text) to authenticated;

-- ============================================================================
-- END OF MIGRATION 037
-- ============================================================================
