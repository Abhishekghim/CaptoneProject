"use client";

import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, LayoutDashboard, ScanLine,
  Timer, UserCog, Users, UserX, XCircle,
} from "lucide-react";
import { useStore, deriveReferralStatus } from "@/frontend/lib/store";
import AppointmentManageForm from "@/frontend/components/shared/AppointmentManageForm";
import StaffMessagingPanel from "@/frontend/components/shared/StaffMessagingPanel";
import { EmptyState, SectionTitle, StatCard, StatusChip } from "@/frontend/components/shared/ui";
import PatientRegistry from "./PatientRegistry";
import type { Appointment, Billing } from "@/shared/types";

const CANCELLATION_REASONS = ["Patient request", "Clinical reason", "Scheduling conflict", "No longer required", "Other"];

function getAttentionReasons(apt: Appointment, bill: Billing | undefined): string[] {
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

export default function ReceptionDashboard() {
  const store = useStore();
  const [tab, setTab] = useState<"schedule" | "patients">("schedule");
  const [focusPatientId, setFocusPatientId] = useState<string | null>(null);

  function viewPatient(patientId: string) {
    setFocusPatientId(patientId);
    setTab("patients");
  }

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const today = useMemo(
    () => store.appointments.filter((a) => a.date === todayStr).sort((a, b) => a.time_slot.localeCompare(b.time_slot)),
    [store.appointments, todayStr]
  );
  const activeToday = today.filter((a) => a.status !== "cancelled");

  const checkedInCount = activeToday.filter((a) => a.arrival_status !== "not_arrived" && a.arrival_status !== "no_show").length;
  const waitingCount = activeToday.filter((a) => a.arrival_status === "waiting").length;
  const inProgressCount = activeToday.filter((a) => a.status === "in_progress").length;
  const completedCount = activeToday.filter((a) => a.status === "completed").length;
  const attentionCount = activeToday.filter((a) => getAttentionReasons(a, store.billing.find((b) => b.appointment_id === a.id)).length > 0).length;

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <section id="today-s-schedule">
        <SectionTitle
          icon={LayoutDashboard}
          title={`Reception — ${format(new Date(), "EEEE d MMM yyyy")}`}
          subtitle="Front-desk overview for today"
          action={
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setTab("schedule")} aria-pressed={tab === "schedule"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === "schedule" ? "bg-medical text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                Today's schedule
              </button>
              <button type="button" onClick={() => { setFocusPatientId(null); setTab("patients"); }} aria-pressed={tab === "patients"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === "patients" ? "bg-medical text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                Patients
              </button>
            </div>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard icon={CalendarClock} label="Today's appointments" value={String(activeToday.length)} />
          <StatCard icon={CheckCircle2} label="Checked in" value={String(checkedInCount)} />
          <StatCard icon={Clock} label="Waiting" value={String(waitingCount)} />
          <StatCard icon={ScanLine} label="In progress" value={String(inProgressCount)} />
          <StatCard icon={Users} label="Completed" value={String(completedCount)} />
          <StatCard icon={AlertTriangle} label="Needs attention" value={String(attentionCount)} />
        </div>
      </section>

      {tab === "patients" ? (
        <PatientRegistry initialPatientId={focusPatientId} />
      ) : (
        <>
          <TodaysScheduleTable appointments={today} onViewPatient={viewPatient} />
          <WaitingRoomSection appointments={activeToday} />
          <AttentionRequiredSection appointments={activeToday} onViewPatient={viewPatient} />
          <StaffMessagingPanel />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function TodaysScheduleTable({
  appointments, onViewPatient,
}: {
  appointments: Appointment[];
  onViewPatient: (patientId: string) => void;
}) {
  const store = useStore();
  const [filter, setFilter] = useState("");
  const [managingId, setManagingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const technicians = store.profiles.filter((p) => p.role === "technician");
  const radiologists = store.profiles.filter((p) => p.role === "radiologist");

  const rows = appointments.filter((a) => {
    if (!filter) return true;
    const patient = store.profiles.find((p) => p.id === a.patient_id);
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
                const patient = store.profiles.find((p) => p.id === a.patient_id);
                const record = store.records.find((r) => r.patient_id === a.patient_id);
                const bill = store.billing.find((b) => b.appointment_id === a.id);
                const referringLabel = a.referring_doctor_id
                  ? store.profiles.find((p) => p.id === a.referring_doctor_id)?.full_name
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
                      <td className="py-2.5 pr-4 text-xs text-slate-500">{referringLabel ?? "Self-referred"}</td>
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
                            <button type="button" className="btn-primary px-2.5 py-1 text-xs" onClick={() => store.checkInAppointment(a.id)}>
                              <CheckCircle2 size={13} aria-hidden /> Check in
                            </button>
                          )}
                          {!a.confirmed && a.status === "scheduled" && (
                            <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => store.confirmAppointment(a.id)}>Confirm</button>
                          )}
                          {a.arrival_status === "not_arrived" && (
                            <button type="button" className="btn-ghost px-2.5 py-1 text-xs text-amber-700" onClick={() => store.markNoShow(a.id)}>
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
                      </td>
                    </tr>
                    {managing && (
                      <tr>
                        <td colSpan={8}>
                          <AppointmentManageForm appointment={a} technicians={technicians} radiologists={radiologists} onDone={() => setManagingId(null)} />
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
function CancelDialog({ appointment, patientName, onClose }: { appointment: Appointment; patientName: string; onClose: () => void }) {
  const store = useStore();
  const [reason, setReason] = useState(CANCELLATION_REASONS[0]);
  const [otherReason, setOtherReason] = useState("");

  function confirm() {
    const finalReason = reason === "Other" ? otherReason.trim() : reason;
    if (reason === "Other" && !finalReason) return;
    store.cancelAppointment(appointment.id, finalReason);
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
        <select id={`cancel-reason-${appointment.id}`} className="input w-48" value={reason} onChange={(e) => setReason(e.target.value)}>
          {CANCELLATION_REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        {reason === "Other" && (
          <input className="input w-48" placeholder="Reason" value={otherReason} onChange={(e) => setOtherReason(e.target.value)} />
        )}
        <button type="button" onClick={confirm} className="btn-primary bg-rose-600 px-3 py-1.5 text-xs hover:bg-rose-700">Confirm cancellation</button>
        <button type="button" onClick={onClose} className="btn-ghost px-3 py-1.5 text-xs">Keep appointment</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function WaitingRoomSection({ appointments }: { appointments: Appointment[] }) {
  const store = useStore();
  const waiting = appointments.filter((a) => a.arrival_status === "waiting").sort((a, b) => (a.checked_in_at ?? "").localeCompare(b.checked_in_at ?? ""));

  return (
    <section id="waiting-room" className="card p-5 sm:p-6">
      <SectionTitle icon={Timer} title="Waiting room" subtitle="Patients currently checked in and waiting" />
      {waiting.length === 0 ? (
        <EmptyState message="No patients waiting" hint="Patients who check in will appear here." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {waiting.map((a) => {
            const patient = store.profiles.find((p) => p.id === a.patient_id);
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
function AttentionRequiredSection({ appointments, onViewPatient }: { appointments: Appointment[]; onViewPatient: (patientId: string) => void }) {
  const store = useStore();
  const flagged = appointments
    .map((a) => ({ a, reasons: getAttentionReasons(a, store.billing.find((b) => b.appointment_id === a.id)) }))
    .filter(({ reasons }) => reasons.length > 0);

  return (
    <section id="attention-required" className="card p-5 sm:p-6">
      <SectionTitle icon={AlertTriangle} title="Needs attention" subtitle="Administrative items only — never clinical" />
      {flagged.length === 0 ? (
        <EmptyState message="Nothing needs attention" hint="Missing referrals, unconfirmed bookings, and no-shows will appear here." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {flagged.map(({ a, reasons }) => {
            const patient = store.profiles.find((p) => p.id === a.patient_id);
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
