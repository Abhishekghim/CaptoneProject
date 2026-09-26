"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarClock, Paperclip, X, XCircle } from "lucide-react";
import { LOCATIONS, TIME_SLOTS } from "@/frontend/lib/constants";
import { createClient } from "@/frontend/lib/supabase/client";
import { notifyPatient } from "@/frontend/lib/notify";
import type { Appointment } from "@/shared/types";
import { DatePickerField } from "@/frontend/components/shared/Calendar";
import { StatusChip } from "@/frontend/components/shared/ui";

/* ------------------------------------------------------------------ */
/* Appointment history row (with reschedule)                          */
/* ------------------------------------------------------------------ */
export default function AppointmentHistoryRow({
  appointment: a, upcoming, onChanged,
}: {
  appointment: Appointment;
  upcoming: boolean;
  onChanged: () => void;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState(a.date);
  const [slot, setSlot] = useState(a.time_slot);
  const [location, setLocation] = useState(a.location);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // No client-side "taken slots" hint here: appts_patient_read_own RLS
  // scopes a patient's appointment reads to their own rows only (patient_id
  // = auth.uid()), so there's no way to see whether OTHER patients hold a
  // given slot — attempting the same clash-hint pattern AdminDashboard/
  // AppointmentManageForm use (staff-facing, where is_staff() RLS grants
  // full visibility) would just show the patient their own other bookings
  // as "taken," which is misleading, not a real clash check. The
  // reschedule_appointment RPC's own unique-constraint clash error (surfaced
  // below via `feedback`) already fully covers this case.

  async function saveReschedule() {
    const supabase = createClient();
    const { error } = await supabase.rpc("reschedule_appointment", {
      p_appointment_id: a.id,
      p_date: date,
      p_time_slot: slot,
      p_location: location,
    });
    if (error) {
      setFeedback({ ok: false, text: error.message });
      return;
    }
    setFeedback({ ok: true, text: "Appointment rescheduled." });
    setRescheduling(false);
    onChanged();
    notifyPatient(
      a.patient_id,
      "appointment_rescheduled",
      "Appointment rescheduled",
      `<p>Your ${a.body_part} MRI is now ${date} at ${slot}, ${location}.</p>`,
      a.id
    );
  }

  async function cancelAppointment() {
    const supabase = createClient();
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled", cancellation_reason: a.cancellation_reason })
      .eq("id", a.id);
    if (error) {
      setFeedback({ ok: false, text: error.message });
      return;
    }
    setFeedback({ ok: true, text: "Appointment cancelled." });
    onChanged();
    notifyPatient(
      a.patient_id,
      "appointment_cancelled",
      "Appointment cancelled",
      `<p>Your ${a.body_part} MRI on ${a.date} at ${a.time_slot} has been cancelled.</p>`,
      a.id
    );
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-navy">
            {a.body_part} — {format(parseISO(a.date), "EEE d MMM yyyy")} at {a.time_slot}
          </p>
          <p className="text-xs text-slate-500">
            {a.location}
            {a.referral_url && (
              <> · <Paperclip size={12} className="inline" aria-hidden /> referral attached</>
            )}
          </p>
          {/* Reception hasn't confirmed this booking yet — see
              backend/database/033_booking_review_gate.sql and
              ReceptionDashboard.tsx's matching "Unconfirmed" badge. */}
          {!a.confirmed && a.status === "scheduled" && (
            <p className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              Pending reception review
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <StatusChip status={a.status} />
          {upcoming && (
            <>
              <button
                type="button"
                onClick={() => setRescheduling((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-medical hover:text-medical-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical"
              >
                <CalendarClock size={14} aria-hidden /> Reschedule
              </button>
              <button
                type="button"
                onClick={cancelAppointment}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
              >
                <XCircle size={14} aria-hidden /> Cancel
              </button>
            </>
          )}
        </div>
      </div>
      {rescheduling && (
        <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <DatePickerField value={date} onChange={setDate} />
          <div>
            <label htmlFor={`resched-loc-${a.id}`} className="label">Location</label>
            <select id={`resched-loc-${a.id}`} className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
              {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
            </select>
            <span className="label mt-3 block">Time slot</span>
            <div className="flex flex-wrap gap-1.5">
              {TIME_SLOTS.map((t) => (
                <button
                  key={t} type="button" onClick={() => setSlot(t)}
                  className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                    slot === t ? "border-medical bg-medical text-white" : "border-slate-300 bg-white text-navy"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">If a slot is already booked, you&rsquo;ll see an error when you confirm — pick another time and try again.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={saveReschedule} className="btn-primary text-xs">Confirm new time</button>
              <button type="button" onClick={() => setRescheduling(false)} className="btn-ghost text-xs">
                <X size={13} aria-hidden /> Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {feedback && (
        <p role="status" className={`mt-2 rounded-md p-2 text-xs font-semibold ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {feedback.text}
        </p>
      )}
    </li>
  );
}
