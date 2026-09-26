-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 015: appointment + billing RPCs
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-014).
--
-- Phase 3a of moving off frontend/lib/store.tsx mock data onto real Supabase
-- persistence. Three RPCs porting bookAppointment / rescheduleAppointment /
-- resolveInsuranceClaim from the mock store onto real transactional
-- Postgres functions. All three are plain SECURITY INVOKER (the default —
-- no DEFINER clause below): they run as the calling user and are fully
-- subject to existing RLS, exactly like a direct client insert/update would
-- be. Clash detection is never re-implemented in plpgsql — both
-- book_appointment and reschedule_appointment rely on the existing
-- `no_double_booking unique (date, time_slot, location)` constraint
-- (schema.sql 2.3) and just translate its unique_violation into a clean,
-- catchable error message.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. book_appointment — ports frontend/lib/store.tsx bookAppointment
-- (~lines 285-364): inserts the appointment and its paired billing row in
-- one transaction (a plpgsql function body runs in the caller's
-- transaction, so both inserts commit or roll back together).
--
-- Deliberately narrower than the mock action: no audit-log write or
-- notification push here — appointment-insert notification is already
-- covered by the existing trg_notify_appointment_booked trigger
-- (schema.sql 4.5), and there is currently no trg_audit_appointments
-- trigger on this table (audit writes for appointments stay a phase-10
-- concern, same as it is today). Referral linking (p_referral_id) and the
-- staff-booked-vs-patient-self-service `confirmed` distinction ARE ported
-- below (added after the initial 3a pass, matching bookAppointment exactly):
--   const finalReferringDoctorId = referral ? referral.referring_doctor_id : referringDoctorId;
--   const staffBooked = targetPatientId !== currentUser.id;
--   confirmed: staffBooked,
--   referral_reviewed: Boolean(referral), referral_reviewed_at: referral ? now() : null,
--   ...and on success: doctorReferrals row's used_in_appointment_id is set to the new appointment id.
--
-- referring_doctor_link_xor_freetext (005_referral_review_and_free_text_doctor.sql)
-- requires that a row never carries both a linked referring_doctor_id AND
-- free-text name/practice — mirrored here exactly the way
-- bookAppointment resolves it: `referring_doctor_name: finalReferringDoctorId
-- ? null : referringDoctorName` (and the same for practice) — so when a
-- linked doctor id is supplied, the free-text fields are nulled rather than
-- left to the constraint to reject the insert outright.
-- ----------------------------------------------------------------------------
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
begin
  -- A doctor-initiated referral always wins over anything the caller
  -- separately typed/picked — it's already a verified account, not a
  -- free-text claim (mirrors bookAppointment's `finalReferringDoctorId`).
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

  begin
    insert into public.appointments (
      patient_id, date, time_slot, location, body_part,
      referring_doctor_id, referring_doctor_name, referring_doctor_practice, referral_url,
      referral_reviewed, referral_reviewed_at, confirmed
    ) values (
      p_patient_id, p_date, p_time_slot, p_location, p_body_part,
      v_final_doctor_id, v_doctor_name, v_doctor_practice, p_referral_url,
      (p_referral_id is not null), case when p_referral_id is not null then now() else null end, v_staff_booked
    )
    returning * into v_appointment;
  exception when unique_violation then
    raise exception 'This time slot is already booked. Choose another time.' using errcode = 'unique_violation';
  end;

  -- Relies on billing_insert_via_booking (section 3 below) so a patient
  -- booking their own appointment, or reception booking on a patient's
  -- behalf, can insert this row — billing_admin_write alone (admin-only)
  -- would otherwise block every non-admin booker.
  insert into public.billing (appointment_id, amount, payment_status, payment_method)
  values (v_appointment.id, p_amount, 'pending', p_payment_type);

  -- Mark the referral used so it can't be applied to a second booking —
  -- mirrors bookAppointment's `setDoctorReferrals(... used_in_appointment_id: apt.id ...)`.
  -- Relies on doctor_referrals' own RLS (doctor_referrals_patient_mark_used /
  -- doctor_referrals_staff_all) to authorize this update under SECURITY INVOKER.
  if p_referral_id is not null then
    update public.doctor_referrals
    set used_in_appointment_id = v_appointment.id
    where id = p_referral_id;
  end if;

  return v_appointment;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. reschedule_appointment — ports frontend/lib/store.tsx
-- rescheduleAppointment (~lines 387-413): updates date/time_slot/location,
-- relying on the same no_double_booking constraint for clash detection.
-- RLS (appts_patient_cancel_own — despite its name, this is the general
-- "own row or staff" update policy on appointments, not cancel-specific;
-- left as-is, not renamed) already restricts which rows a given caller can
-- update, so a patient can only reschedule their own appointment and staff
-- (including reception) can reschedule any.
-- ----------------------------------------------------------------------------
create or replace function public.reschedule_appointment(
  p_appointment_id uuid,
  p_date date,
  p_time_slot text,
  p_location text
)
returns public.appointments
language plpgsql
as $$
declare
  v_appointment public.appointments;
begin
  begin
    update public.appointments
    set date = p_date, time_slot = p_time_slot, location = p_location
    where id = p_appointment_id
    returning * into v_appointment;
  exception when unique_violation then
    raise exception 'This time slot is already booked. Choose another time.' using errcode = 'unique_violation';
  end;

  if v_appointment.id is null then
    raise exception 'Appointment not found or you do not have permission to reschedule it.';
  end if;

  return v_appointment;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. billing_insert_via_booking — new INSERT-only RLS policy on billing.
--
-- Real gap this closes: billing_admin_write (schema.sql 5, "billing") is
-- `for all using (is_admin())`, so under SECURITY INVOKER, book_appointment
-- above could not insert a billing row for a self-service patient booking
-- (patient is not admin) or a reception booking (reception is staff, not
-- admin). This policy grants INSERT only — not update/delete/select, which
-- remain governed entirely by billing_patient_read_own / billing_admin_write
-- as before — scoped to exactly "the billing row's appointment belongs to
-- me, or I'm staff", which matches exactly who is allowed to call
-- book_appointment in the first place (appts_patient_create_own: patient_id
-- = auth.uid() or is_staff()).
-- ----------------------------------------------------------------------------
drop policy if exists "billing_insert_via_booking" on public.billing;
create policy "billing_insert_via_booking" on public.billing
  for insert with check (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_id and (a.patient_id = auth.uid() or public.is_staff())
    )
  );

-- ----------------------------------------------------------------------------
-- 4. resolve_insurance_claim — ports frontend/lib/store.tsx
-- resolveInsuranceClaim (~lines 710-748) field-for-field:
--
--   setBilling(prev => prev.map(b => b.id === billId ? {
--     ...b,
--     insurance_claim_status: approved ? "approved" : "rejected",
--     insurance_resolved_at: new Date().toISOString(),
--     insurance_note: note || null,
--     payment_status: approved ? "paid" : b.payment_status,
--     paid_at: approved ? new Date().toISOString() : b.paid_at,
--     receipt_url: approved ? `receipts/${billId}.pdf` : b.receipt_url,
--   } : b))
--
-- Note the mock sets receipt_url too on approval (not just payment_status/
-- paid_at) — mirrored below. On rejection, only insurance_claim_status/
-- insurance_resolved_at/insurance_note change; payment_status, paid_at and
-- receipt_url are left exactly as they were (`: b.payment_status` etc.).
-- Stays admin-gated via the existing billing_admin_write policy (this RPC
-- adds no new policy) — matches the mock UI restricting this action to
-- admin.
-- ----------------------------------------------------------------------------
create or replace function public.resolve_insurance_claim(
  p_bill_id uuid,
  p_approved boolean,
  p_note text
)
returns public.billing
language plpgsql
as $$
declare
  v_billing public.billing;
begin
  update public.billing
  set
    insurance_claim_status = case when p_approved then 'approved' else 'rejected' end,
    insurance_resolved_at = now(),
    insurance_note = nullif(p_note, ''),
    payment_status = case when p_approved then 'paid'::payment_status else payment_status end,
    paid_at = case when p_approved then now() else paid_at end,
    receipt_url = case when p_approved then 'receipts/' || p_bill_id || '.pdf' else receipt_url end
  where id = p_bill_id
  returning * into v_billing;

  if v_billing.id is null then
    raise exception 'Billing record not found or you do not have permission to resolve it.';
  end if;

  return v_billing;
end;
$$;

-- ============================================================================
-- END OF MIGRATION 015
-- ============================================================================
