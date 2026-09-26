"use client";

import React, { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle, CalendarClock, CheckCircle2, FileText, Timer, UserCog, UserX, XCircle,
} from "lucide-react";
import { getSignedUrl } from "@/frontend/lib/storage";
import { deriveReferralStatus } from "@/shared/deriveReferralStatus";
import AppointmentManageForm from "@/frontend/components/shared/AppointmentManageForm";
import { EmptyState, SectionTitle, StatusChip } from "@/frontend/components/shared/ui";
import { createClient } from "@/frontend/lib/supabase/client";
import { notifyPatient } from "@/frontend/lib/notify";
import { useMedicalRecords } from "@/frontend/lib/hooks/useMedicalRecords";
import type { ProfileRow } from "@/frontend/lib/hooks/useProfiles";
import type { Appointment, Billing } from "@/shared/types";

const CANCELLATION_REASONS = ["Patient request", "Clinical reason", "Scheduling conflict", "No longer required", "Other"];

export function getAttentionReasons(apt: Appointment, bill: Billing | undefined): string[] {
  const reasons: string[] = [];
  const referralStatus = deriveReferralStatus(apt);
  if (referralStatus === "missing") reasons.push("Missing referral");
  else if (referralStatus === "pending_verification") reasons.push("Referral needs verification");
  else if (referralStatus === "rejected") reasons.push("Referral rejected");
  else if (referralStatus === "expired") reasons.push("Referral expired");
  if (bill && bill.payment_status === "pending" && !bill.payment_method) reasons.push("Payment information incomplete");
  if (!apt.confirmed && apt.status !== "cancelled" && apt.status !== "completed") reasons.push("Confirmation required");
  if (apt.arrival_status === "no_show") reasons.push("Patient did not arrive");
  return reasons;
}

/* ------------------------------------------------------------------ */
export function TodaysScheduleTable({
  appointments, profiles, billing, onViewPatient, onChanged,
}: {
  appointments: Appointment[];
  profiles: ProfileRow[];
  billing: Billing[];
  onViewPatient: (patientId: string) => void;
  onChanged: () => void;
}) {
  const { data: records } = useMedicalRecords();
  const [filter, setFilter] = useState("");
  const [managingId, setManagingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const technicians = profiles.filter((p) => p.role === "technician");
  const radiologists = profiles.filter((p) => p.role === "radiologist");

  async function checkIn(a: Appointment) {
    setRowErrors((e) => ({ ...e, [a.id]: "" }));
    if (a.status === "cancelled") {
      setRowErrors((e) => ({ ...e, [a.id]: "This appointment was cancelled — it can't be checked in." }));
      return;
    }
    const supabase = createClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("appointments")
      .update({ arrival_status: "waiting", arrived_at: a.arrived_at ?? now, checked_in_at: now })
      .eq("id", a.id);
    if (error) {
      setRowErrors((e) => ({ ...e, [a.id]: error.message }));
      return;
    }
    onChanged();
  }

  async function confirmAppointment(a: Appointment) {
    setRowErrors((e) => ({ ...e, [a.id]: "" }));
    const supabase = createClient();
    const { error } = await supabase.from("appointments").update({ confirmed: true }).eq("id", a.id);
    if (error) {
      setRowErrors((e) => ({ ...e, [a.id]: error.message }));
      return;
    }
    onChanged();
  }

  async function viewReferral(a: Appointment) {
    if (!a.referral_url) return;
    setRowErrors((e) => ({ ...e, [a.id]: "" }));
    const url = await getSignedUrl(a.referral_url);
    if (!url) {
      setRowErrors((e) => ({ ...e, [a.id]: "Could not open the referral document." }));
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function markNoShow(a: Appointment) {
    setRowErrors((e) => ({ ...e, [a.id]: "" }));
    const supabase = createClient();
    const { error } = await supabase.from("appointments").update({ arrival_status: "no_show" }).eq("id", a.id);
    if (error) {
      setRowErrors((e) => ({ ...e, [a.id]: error.message }));
      return;
    }
    onChanged();
  }

  const rows = appointments.filter((a) => {
    if (!filter) return true;
    const patient = profiles.find((p) => p.id === a.patient_id);
    const needle = filter.toLowerCase();
    return patient?.full_name.toLowerCase().includes(needle) || a.body_part.toLowerCase().includes(needle);
  });

  return (
    <section id="schedule-table" className="card p-5 sm:p-6">
      <SectionTitle
        icon={CalendarClock}
        title="Today's schedule"
        subtitle="Check in, reschedule, or cancel — reception never touches clinical status or reports"
        action={
          <>
            <label className="sr-only" htmlFor="sched-search">Search today's appointments</label>
            <input id="sched-search" className="input w-48" placeholder="Search patient or exam" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState message="No appointments today" hint="Today's bookings will appear here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Patient</th>
                <th className="py-2 pr-4">Exam</th>
                <th className="py-2 pr-4">Referring</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Arrival</th>
                <th className="py-2 pr-4">Payment</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const patient = profiles.find((p) => p.id === a.patient_id);
                const record = (records ?? []).find((r) => r.patient_id === a.patient_id);
                const bill = billing.find((b) => b.appointment_id === a.id);
                const referringLabel = a.referring_doctor_id
                  ? profiles.find((p) => p.id === a.referring_doctor_id)?.full_name
                  : a.referring_doctor_name;
                const canModify = a.status === "scheduled" || a.status === "in_progress";
                const managing = managingId === a.id;
                const canceling = cancelingId === a.id;

                return (
                  <React.Fragment key={a.id}>
                    <tr className="border-b border-slate-100 align-top last:border-0">
                      <td className="py-2.5 pr-4 font-mono text-xs">{a.time_slot}</td>
                      <td className="py-2.5 pr-4">
                        <button type="button" onClick={() => onViewPatient(a.patient_id)} className="font-semibold text-navy hover:text-medical hover:underline">
                          {patient?.full_name ?? "Unknown patient"}
                        </button>
                        {record?.dob && <p className="text-[11px] text-slate-400">DOB {format(parseISO(record.dob), "d MMM yyyy")} · {record.patient_code}</p>}
                      </td>
                      <td className="py-2.5 pr-4">{a.body_part}</td>
                      <td className="py-2.5 pr-4 text-xs text-slate-500">
                        {referringLabel ?? "Self-referred"}
                        {a.referral_url && (
                          <button
                            type="button"
                            onClick={() => viewReferral(a)}
                            className="mt-0.5 flex items-center gap-1 font-semibold text-medical hover:underline"
                          >
                            <FileText size={12} aria-hidden /> View referral
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 pr-4"><StatusChip status={a.status} /></td>
                      <td className="py-2.5 pr-4">
                        <span className={`chip ${a.arrival_status === "waiting" ? "bg-amber-100 text-amber-800" : a.arrival_status === "no_show" ? "bg-rose-100 text-rose-800" : a.arrival_status === "checked_in" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                          {a.arrival_status.replace(/_/g, " ")}
                        </span>
                        {!a.confirmed && a.status === "scheduled" && <p className="mt-1 text-[11px] text-amber-700">Unconfirmed</p>}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-slate-500">{bill ? `${bill.payment_status}${bill.payment_method ? ` (${bill.payment_method})` : ""}` : "—"}</td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {(a.arrival_status === "not_arrived" || a.arrival_status === "arrived") && (
                            <button type="button" className="btn-primary px-2.5 py-1 text-xs" onClick={() => checkIn(a)}>
                              <CheckCircle2 size={13} aria-hidden /> Check in
                            </button>
                          )}
                          {!a.confirmed && a.status === "scheduled" && (
                            <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => confirmAppointment(a)}>Confirm</button>
                          )}
                          {a.arrival_status === "not_arrived" && (
                            <button type="button" className="btn-ghost px-2.5 py-1 text-xs text-amber-700" onClick={() => markNoShow(a)}>
                              <UserX size={13} aria-hidden /> No-show
                            </button>
                          )}
                          {canModify && (
                            <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setManagingId(managing ? null : a.id)} aria-expanded={managing}>
                              <UserCog size={13} aria-hidden /> Manage
                            </button>
                          )}
                          {canModify && (
                            <button type="button" className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700" onClick={() => setCancelingId(canceling ? null : a.id)}>
                              <XCircle size={13} aria-hidden /> Cancel
                            </button>
                          )}
                        </div>
                        {rowErrors[a.id] && (
                          <p role="alert" className="mt-1 text-[11px] font-semibold text-rose-700">{rowErrors[a.id]}</p>
                        )}
                      </td>
                    </tr>
                    {managing && (
                      <tr>
                        <td colSpan={8}>
                          <AppointmentManageForm
                            appointment={a}
                            technicians={technicians}
                            radiologists={radiologists}
                            onDone={() => setManagingId(null)}
                            onSaved={onChanged}
                            canAssignRadiologist={false}
                          />
                        </td>
                      </tr>
                    )}
                    {canceling && (
                      <tr>
                        <td colSpan={8}>
                          <CancelDialog
                            appointment={a}
                            patientName={patient?.full_name ?? "this patient"}
                            onClose={() => setCancelingId(null)}
                            onChanged={onChanged}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
function CancelDialog({
  appointment, patientName, onClose, onChanged,
}: {
  appointment: Appointment;
  patientName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState(CANCELLATION_REASONS[0]);
  const [otherReason, setOtherReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmCancel() {
    const finalReason = reason === "Other" ? otherReason.trim() : reason;
    if (reason === "Other" && !finalReason) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status: "cancelled", cancellation_reason: finalReason ?? appointment.cancellation_reason })
      .eq("id", appointment.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    notifyPatient(
      appointment.patient_id,
      "appointment_cancelled",
      "Appointment cancelled",
      `<p>Your ${appointment.body_part} MRI on ${appointment.date} at ${appointment.time_slot} has been cancelled.</p>`,
      appointment.id
    );
    onChanged();
    onClose();
  }

  return (
    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-4">
      <p className="text-sm font-semibold text-navy">Cancel appointment?</p>
      <p className="mt-1 text-xs text-slate-600">
        {patientName} — {appointment.body_part} — {format(parseISO(appointment.date), "d MMM yyyy")} at {appointment.time_slot}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`cancel-reason-${appointment.id}`}>Cancellation reason</label>
        <select id={`cancel-reason-${appointment.id}`} className="input w-48" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy}>
          {CANCELLATION_REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        {reason === "Other" && (
          <input className="input w-48" placeholder="Reason" value={otherReason} onChange={(e) => setOtherReason(e.target.value)} disabled={busy} />
        )}
        <button type="button" disabled={busy} onClick={confirmCancel} className="btn-primary bg-rose-600 px-3 py-1.5 text-xs hover:bg-rose-700">
          {busy ? "Cancelling…" : "Confirm cancellation"}
        </button>
        <button type="button" disabled={busy} onClick={onClose} className="btn-ghost px-3 py-1.5 text-xs">Keep appointment</button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function WaitingRoomSection({ appointments, profiles }: { appointments: Appointment[]; profiles: ProfileRow[] }) {
  const waiting = appointments.filter((a) => a.arrival_status === "waiting").sort((a, b) => (a.checked_in_at ?? "").localeCompare(b.checked_in_at ?? ""));

  return (
    <section id="waiting-room" className="card p-5 sm:p-6">
      <SectionTitle icon={Timer} title="Waiting room" subtitle="Patients currently checked in and waiting" />
      {waiting.length === 0 ? (
        <EmptyState message="No patients waiting" hint="Patients who check in will appear here." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {waiting.map((a) => {
            const patient = profiles.find((p) => p.id === a.patient_id);
            const minutes = a.checked_in_at ? Math.max(0, Math.round((Date.now() - new Date(a.checked_in_at).getTime()) / 60000)) : 0;
            const long = minutes >= 30;
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-semibold text-navy">{patient?.full_name ?? "Unknown"} — {a.body_part}</p>
                  <p className="text-xs text-slate-500">
                    Appointment {a.time_slot}{a.checked_in_at && ` · Arrived ${format(parseISO(a.checked_in_at), "h:mm a")}`}
                  </p>
                </div>
                <span className={`chip ${long ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>
                  Waiting {minutes} min{long ? " — long wait" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
export function AttentionRequiredSection({
  appointments, billing, profiles, onViewPatient,
}: {
  appointments: Appointment[];
  billing: Billing[];
  profiles: ProfileRow[];
  onViewPatient: (patientId: string) => void;
}) {
  const flagged = appointments
    .map((a) => ({ a, reasons: getAttentionReasons(a, billing.find((b) => b.appointment_id === a.id)) }))
    .filter(({ reasons }) => reasons.length > 0);

  return (
    <section id="attention-required" className="card p-5 sm:p-6">
      <SectionTitle icon={AlertTriangle} title="Needs attention" subtitle="Administrative items only — never clinical" />
      {flagged.length === 0 ? (
        <EmptyState message="Nothing needs attention" hint="Missing referrals, unconfirmed bookings, and no-shows will appear here." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {flagged.map(({ a, reasons }) => {
            const patient = profiles.find((p) => p.id === a.patient_id);
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <button type="button" onClick={() => onViewPatient(a.patient_id)} className="font-semibold text-navy hover:text-medical hover:underline">
                    {patient?.full_name ?? "Unknown"}
                  </button>
                  <span className="text-slate-500"> — {a.body_part}, {a.time_slot}</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {reasons.map((r) => <span key={r} className="chip bg-amber-100 text-amber-800">{r}</span>)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
