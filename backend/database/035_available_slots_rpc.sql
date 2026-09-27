-- ============================================================================
-- CAPITAL RADIOLOGY — Migration 035: real-time slot availability
-- Run in Supabase SQL Editor AFTER schema.sql (and 002-034 if used).
--
-- The patient booking form (BookingCard.tsx) previously had no way to know
-- which time slots were already taken before submitting — appts_patient_
-- read_own only lets a patient read their OWN appointments (schema.sql), so
-- a clash only surfaced as an error from book_appointment's unique_violation
-- catch (033_booking_review_gate.sql) after clicking "Book appointment".
--
-- This adds a narrow, privacy-safe read: which of the fixed TIME_SLOTS
-- (frontend/lib/constants.ts) are already taken for a given date + location,
-- per the same `no_double_booking unique (date, time_slot, location)`
-- constraint (schema.sql) — never who booked them or what for. security
-- definer is required (same reasoning as other cross-patient aggregate reads
-- in this app, e.g. the AI assistant's admin scope) since it must see every
-- patient's appointments for that slot, not just the caller's own.
-- ============================================================================

-- Deliberately NOT filtering out cancelled appointments: no_double_booking is
-- a plain (not partial) unique constraint, so a cancelled row still occupies
-- its (date, time_slot, location) key and book_appointment would still
-- reject a rebooking there. This has to mirror that exactly, or the UI would
-- show a slot as available only for the submit to then fail — matching the
-- real constraint is a separate, narrower goal than deciding whether
-- cancelling *should* free the slot (that's a bigger change, out of scope
-- here).
create or replace function public.get_taken_slots(p_date date, p_location text)
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(time_slot), '{}')
  from public.appointments
  where date = p_date and location = p_location;
$$;

revoke all on function public.get_taken_slots(date, text) from public;
grant execute on function public.get_taken_slots(date, text) to authenticated;

-- ============================================================================
-- END OF MIGRATION 035
-- ============================================================================
