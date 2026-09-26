"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { LOCATIONS, TIME_SLOTS } from "@/frontend/lib/constants";
import { AppointmentCalendar } from "@/frontend/components/shared/Calendar";
import { createClient } from "@/frontend/lib/supabase/client";
import { notifyPatient } from "@/frontend/lib/notify";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import type { Appointment } from "@/shared/types";

// Staff-side reschedule + technician/radiologist assignment (FR9, FR21).
// Shared by AdminDashboard's "All appointments" panel and the Reception
// Portal's "Today's schedule" table — one implementation, not a duplicate
// per role (the reception spec explicitly asks not to build parallel
// versions of the same component). Both callers are staff-facing, so the
// real, staff-wide useAppointments() (is_staff() RLS) is the right source
// for the taken-slots clash hint here — unlike the patient-facing booking
// forms, there's no RLS visibility gap to work around.
export default function AppointmentManageForm({
  appointment, technicians, radiologists, onDone, onSaved, canAssignRadiologist = true,
}: {
  appointment: Appointment;
  technicians: { id: string; full_name: string }[];
  radiologists: { id: string; full_name: string }[];
  onDone: () => void;
  // Optional: lets a caller that owns its own appointments list (e.g.
  // ReceptionDashboard's TodaysScheduleTable) refresh it after a successful
  // reschedule/assignment. Omitted by AdminDashboard's call site, which
  // manages its own "Manage" open/close state only.
  onSaved?: () => void;
  // Reception can staff a technician but shouldn't be the one deciding
  // which radiologist reads a scan — that's a clinical rostering call, not
  // a front-desk one. Admin's call site leaves this at the default (true).
  canAssignRadiologist?: boolean;
}) {
  const { data: allAppointments } = useAppointments();
  const [date, setDate] = useState(appointment.date);
  const [slot, setSlot] = useState(appointment.time_slot);
  const [location, setLocation] = useState(appointment.location);
  const [technicianId, setTechnicianId] = useState(appointment.assigned_technician_id ?? "");
  const [radiologistId, setRadiologistId] = useState(appointment.assigned_radiologist_id ?? "");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const takenSlots = (allAppointments ?? [])
    .filter((a) => a.id !== appointment.id && a.date === date && a.location === location && a.status !== "cancelled")
    .map((a) => a.time_slot);

  async function saveReschedule() {
    const supabase = createClient();
    const { error } = await supabase.rpc("reschedule_appointment", {
      p_appointment_id: appointment.id,
      p_date: date,
      p_time_slot: slot,
      p_location: location,
    });
    if (error) {
      setFeedback({ ok: false, text: error.message });
      return;
    }
    setFeedback({ ok: true, text: "Appointment rescheduled and the patient has been notified." });
    onSaved?.();
    notifyPatient(
      appointment.patient_id,
      "appointment_rescheduled",
      "Appointment rescheduled",
      `<p>Your ${appointment.body_part} MRI is now ${date} at ${slot}, ${location}.</p>`,
      appointment.id
    );
  }

  async function saveAssignment() {
    const supabase = createClient();
    const payload: Record<string, string | null> = { assigned_technician_id: technicianId || null };
    if (canAssignRadiologist) payload.assigned_radiologist_id = radiologistId || null;
    const { error } = await supabase
      .from("appointments")
      .update(payload)
      .eq("id", appointment.id);
    if (error) {
      setFeedback({ ok: false, text: error.message });
      return;
    }
    setFeedback({ ok: true, text: "Staff assignment saved." });
    onSaved?.();
  }

  return (
    <div className="mt-3 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Reschedule</p>
        <AppointmentCalendar value={date} onChange={setDate} />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor={`loc-${appointment.id}`} className="label">Location</label>
            <select id={`loc-${appointment.id}`} className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
              {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <span className="label">Time slot</span>
            <div className="flex flex-wrap gap-1.5">
              {TIME_SLOTS.map((t) => {
                const taken = takenSlots.includes(t);
                return (
                  <button
                    key={t} type="button" disabled={taken} onClick={() => setSlot(t)}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                      taken ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through"
                      : slot === t ? "border-medical bg-medical text-white" : "border-slate-300 bg-white text-navy"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <button type="button" onClick={saveReschedule} className="btn-primary mt-3 text-xs">Save new date/time</button>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Assign staff (FR21)</p>
        <div className="space-y-2">
          <div>
            <label htmlFor={`tech-${appointment.id}`} className="label">Technician</label>
            <select id={`tech-${appointment.id}`} className="input" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              <option value="">Unassigned</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          {canAssignRadiologist && (
            <div>
              <label htmlFor={`rad-${appointment.id}`} className="label">Radiologist</label>
              <select id={`rad-${appointment.id}`} className="input" value={radiologistId} onChange={(e) => setRadiologistId(e.target.value)}>
                <option value="">Unassigned</option>
                {radiologists.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
              </select>
            </div>
          )}
          <button type="button" onClick={saveAssignment} className="btn-primary text-xs">Save assignment</button>
        </div>
        <button type="button" onClick={onDone} className="mt-4 flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
          <X size={13} aria-hidden /> Close
        </button>
        {feedback && (
          <p role="status" className={`mt-3 rounded-md p-2 text-xs font-semibold ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
            {feedback.text}
          </p>
        )}
      </div>
    </div>
  );
}
