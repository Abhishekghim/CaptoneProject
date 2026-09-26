-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 033: booking review gate
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-032 if used).
--
-- Product decision (2026-09-25): appointments.confirmed already exists
-- (013_appointments_arrival_workflow.sql) and ReceptionDashboard.tsx already
-- has a full "Unconfirmed" badge + Confirm button UI for it — but
-- book_appointment (015_appointment_billing_rpcs.sql) only ever set
-- confirmed = staffBooked, so EVERY patient self-booking landed in the
-- review queue regardless of whether a doctor/referral was involved at all.
-- That's stricter than intended. The actual rule: a patient's own booking
-- needs reception review when EITHER the body part is one that always
-- needs clinical sign-off (Brain, Cervical Spine, Lumbar Spine, Abdomen,
-- Pelvis) OR a referring doctor/referral is attached in any form (linked
-- account, free-text name, or a pre-existing doctor_referrals row). A
-- self-referred Shoulder/Right Knee/Left Knee booking with no doctor
-- involved now confirms immediately, same as a staff-booked one always has.
--
-- This replaces book_appointment wholesale (same signature) rather than
-- patching it in place, since the change is to a single return expression
-- deep in the function body — copy of 015's version with only the
-- `confirmed` computation changed.
-- ============================================================================

create or replace function public.body_part_requires_review(p_body_part text)
returns boolean
language sql immutable
as $$
  select p_body_part in ('Brain', 'Cervical Spine', 'Lumbar Spine', 'Abdomen', 'Pelvis');
$$;

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
  p_referral_id uuid default null
)
returns public.appointments
language plpgsql
as $$
declare
  v_appointment public.appointments;
  v_referral public.doctor_referrals;
  v_final_doctor_id uuid := p_referring_doctor_id;
  v_doctor_name text := p_referring_doctor_name;
  v_doctor_practice text := p_referring_doctor_practice;
  v_staff_booked boolean := (p_patient_id is distinct from auth.uid());
  v_has_referral boolean;
  v_confirmed boolean;
begin
  if p_referral_id is not null then
    select * into v_referral from public.doctor_referrals where id = p_referral_id;
    if v_referral.id is null then
      raise exception 'Referral not found or you do not have permission to use it.';
    end if;
    v_final_doctor_id := v_referral.referring_doctor_id;
    v_doctor_name := null;
    v_doctor_practice := null;
  end if;

  if v_final_doctor_id is not null then
    v_doctor_name := null;
    v_doctor_practice := null;
  end if;

  -- A referral is "involved" if there's a linked doctor account, a
  -- free-text doctor name, or this came from a pre-existing doctor_referrals
  -- row — any one of those is enough to require review.
  v_has_referral := (v_final_doctor_id is not null) or (v_doctor_name is not null) or (p_referral_id is not null);

  v_confirmed := v_staff_booked or not (public.body_part_requires_review(p_body_part) or v_has_referral);

  begin
    insert into public.appointments (
      patient_id, date, time_slot, location, body_part,
      referring_doctor_id, referring_doctor_name, referring_doctor_practice, referral_url,
      referral_reviewed, referral_reviewed_at, confirmed
    ) values (
      p_patient_id, p_date, p_time_slot, p_location, p_body_part,
      v_final_doctor_id, v_doctor_name, v_doctor_practice, p_referral_url,
      (p_referral_id is not null), case when p_referral_id is not null then now() else null end, v_confirmed
    )
    returning * into v_appointment;
  exception when unique_violation then
    raise exception 'This time slot is already booked. Choose another time.' using errcode = 'unique_violation';
  end;

  insert into public.billing (appointment_id, amount, payment_status, payment_method)
  values (v_appointment.id, p_amount, 'pending', p_payment_type);

  if p_referral_id is not null then
    update public.doctor_referrals
    set used_in_appointment_id = v_appointment.id
    where id = p_referral_id;
  end if;

  return v_appointment;
end;
$$;

-- ============================================================================
-- END OF MIGRATION 033
-- ============================================================================
