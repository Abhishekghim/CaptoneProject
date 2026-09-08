"use client";

import React, { useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  Activity, BadgeDollarSign, CalendarClock, ClipboardCheck, FileClock, LayoutDashboard,
  PlusCircle, Receipt, ScanLine, ShieldCheck, UserCog, Wrench, X, XCircle,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { LOCATIONS, TIME_SLOTS } from "@/lib/seed";
import { downloadReceiptPdf } from "@/lib/receiptPdf";
import { AppointmentCalendar } from "@/components/shared/Calendar";
import StaffMessagingPanel from "@/components/shared/StaffMessagingPanel";
import { EmptyState, SectionTitle, StatCard, StatusChip } from "@/components/shared/ui";
import DoctorRequestsPanel from "./DoctorRequestsPanel";
import InventoryPanel from "./InventoryPanel";
import ReportsPanel from "./ReportsPanel";
import ContentManagementPanel from "./ContentManagementPanel";
import SecurityAlertsPanel from "./SecurityAlertsPanel";
import AccountDeletionRequestsPanel from "./AccountDeletionRequestsPanel";
import type { Appointment } from "@/lib/types";

export default function AdminDashboard() {
  const store = useStore();

  const now = new Date();
  const monthKey = format(now, "yyyy-MM");

  const totalScans = store.scans.length;
  const monthlyRevenue = store.billing
    .filter((b) => b.payment_status === "paid" && b.paid_at?.startsWith(monthKey))
    .reduce((sum, b) => sum + b.amount, 0);
  const pendingReports = store.scans.filter((s) => {
    const rep = store.reports.find((r) => r.scan_id === s.id);
    return !rep || rep.status === "draft";
  }).length;
  const todaysAppointments = store.appointments.filter(
    (a) => a.date === format(now, "yyyy-MM-dd") && a.status !== "cancelled"
  ).length;

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <section id="overview">
        <SectionTitle icon={LayoutDashboard} title="Operations overview" subtitle="Live key performance indicators" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={ScanLine} label="Total scans performed" value={String(totalScans)} sub="All time, all sites" />
          <StatCard icon={BadgeDollarSign} label="Revenue this month" value={`$${monthlyRevenue.toFixed(2)}`} sub={format(now, "MMMM yyyy")} />
          <StatCard icon={FileClock} label="Pending reports" value={String(pendingReports)} sub="Awaiting radiologist sign-off" />
          <StatCard icon={CalendarClock} label="Appointments today" value={String(todaysAppointments)} sub="Scheduled + in progress" />
        </div>
      </section>

      <AppointmentsPanel />
      <BillingPanel />
      <DoctorRequestsPanel />
      <EquipmentPanel />
      <InventoryPanel />
      <ReportsPanel />
      <ContentManagementPanel />
      <SecurityAlertsPanel />
      <AccountDeletionRequestsPanel />
      <StaffMessagingPanel />
      <AuditPanel />
    </div>
  );
}

/* ------------------------------------------------------------------ */
function AppointmentsPanel() {
  const store = useStore();
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Appointment["status"]>("all");
  const [managingId, setManagingId] = useState<string | null>(null);

  const rows = useMemo(() => {
    return store.appointments
      .filter((a) => statusFilter === "all" || a.status === statusFilter)
      .filter((a) => {
        if (!filter) return true;
        const patient = store.profiles.find((p) => p.id === a.patient_id);
        const needle = filter.toLowerCase();
        return (
          patient?.full_name.toLowerCase().includes(needle) ||
          a.body_part.toLowerCase().includes(needle) ||
          a.location.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [store.appointments, store.profiles, filter, statusFilter]);

  const technicians = store.profiles.filter((p) => p.role === "technician");
  const radiologists = store.profiles.filter((p) => p.role === "radiologist");

  return (
    <section id="all-appointments" className="card p-5 sm:p-6">
      <SectionTitle
        icon={ClipboardCheck}
        title="All appointments"
        subtitle="Oversee, reschedule, cancel, or assign staff to any appointment in the system"
        action={
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="apt-search">Search appointments</label>
            <input
              id="apt-search" className="input w-48" placeholder="Search patient, scan, or clinic"
              value={filter} onChange={(e) => setFilter(e.target.value)}
            />
            <label className="sr-only" htmlFor="apt-status">Filter by status</label>
            <select
              id="apt-status" className="input w-40" value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        }
      />
      {rows.length === 0 ? (
        <EmptyState message="No appointments match this filter" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((a) => {
            const patient = store.profiles.find((p) => p.id === a.patient_id);
            const technician = a.assigned_technician_id ? store.profiles.find((p) => p.id === a.assigned_technician_id) : null;
            const radiologist = a.assigned_radiologist_id ? store.profiles.find((p) => p.id === a.assigned_radiologist_id) : null;
            const managing = managingId === a.id;
            const canModify = a.status === "scheduled" || a.status === "in_progress";
            return (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy">
                      {patient?.full_name ?? "Unknown patient"} — {a.body_part}
                    </p>
                    <p className="text-xs text-slate-500">
                      {format(parseISO(a.date), "d MMM yyyy")} {a.time_slot} · {a.location}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Tech: {technician?.full_name ?? "unassigned"} · Radiologist: {radiologist?.full_name ?? "unassigned"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusChip status={a.status} />
                    {canModify && (
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => setManagingId(managing ? null : a.id)}
                        aria-expanded={managing}
                      >
                        <UserCog size={13} aria-hidden /> Manage
                      </button>
                    )}
                    {canModify && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700"
                        onClick={() => {
                          if (confirm(`Cancel ${patient?.full_name ?? "this patient"}'s ${a.body_part} appointment?`)) {
                            store.cancelAppointment(a.id);
                          }
                        }}
                      >
                        <XCircle size={13} aria-hidden /> Cancel
                      </button>
                    )}
                  </div>
                </div>
                {managing && <ManageAppointmentForm appointment={a} technicians={technicians} radiologists={radiologists} onDone={() => setManagingId(null)} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ManageAppointmentForm({
  appointment, technicians, radiologists, onDone,
}: {
  appointment: Appointment;
  technicians: { id: string; full_name: string }[];
  radiologists: { id: string; full_name: string }[];
  onDone: () => void;
}) {
  const store = useStore();
  const [date, setDate] = useState(appointment.date);
  const [slot, setSlot] = useState(appointment.time_slot);
  const [location, setLocation] = useState(appointment.location);
  const [technicianId, setTechnicianId] = useState(appointment.assigned_technician_id ?? "");
  const [radiologistId, setRadiologistId] = useState(appointment.assigned_radiologist_id ?? "");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const takenSlots = store.appointments
    .filter((a) => a.id !== appointment.id && a.date === date && a.location === location && a.status !== "cancelled")
    .map((a) => a.time_slot);

  function saveReschedule() {
    const result = store.rescheduleAppointment(appointment.id, { date, time_slot: slot, location });
    setFeedback(result.ok ? { ok: true, text: "Appointment rescheduled and the patient has been notified." } : { ok: false, text: result.error ?? "Could not reschedule." });
  }

  function saveAssignment() {
    store.assignStaffToAppointment(appointment.id, {
      technicianId: technicianId || null,
      radiologistId: radiologistId || null,
    });
    setFeedback({ ok: true, text: "Staff assignment saved." });
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
          <div>
            <label htmlFor={`rad-${appointment.id}`} className="label">Radiologist</label>
            <select id={`rad-${appointment.id}`} className="input" value={radiologistId} onChange={(e) => setRadiologistId(e.target.value)}>
              <option value="">Unassigned</option>
              {radiologists.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
            </select>
          </div>
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

/* ------------------------------------------------------------------ */
function BillingPanel() {
  const store = useStore();
  const open = store.billing.filter((b) => b.payment_status !== "paid" && b.payment_status !== "refunded");
  const insuranceClaims = store.billing.filter((b) => b.payment_method === "insurance" && b.insurance_claim_status !== "not_submitted");

  return (
    <section className="card space-y-6 p-5 sm:p-6">
      <div>
        <SectionTitle icon={Receipt} title="Open billing" subtitle="Record payments and issue digital receipts" />
        {open.length === 0 ? (
          <EmptyState message="No open bills" hint="New bookings generate a pending bill automatically." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Patient</th>
                  <th className="py-2 pr-4">Procedure</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Record payment</th>
                </tr>
              </thead>
              <tbody>
                {open.map((b) => {
                  const apt = store.appointments.find((a) => a.id === b.appointment_id);
                  const patient = apt && store.profiles.find((p) => p.id === apt.patient_id);
                  return (
                    <tr key={b.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-4 font-semibold text-navy">{patient?.full_name ?? "—"}</td>
                      <td className="py-2.5 pr-4">{apt ? `${apt.body_part} · ${format(parseISO(apt.date), "d MMM")}` : "—"}</td>
                      <td className="py-2.5 pr-4 font-semibold">${b.amount.toFixed(2)}</td>
                      <td className="py-2.5 pr-4"><StatusChip status={b.payment_status} /></td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => store.markBillPaid(b.id, "card")}>Card</button>
                          {b.insurance_claim_status === "not_submitted" ? (
                            <InsuranceClaimForm billId={b.id} />
                          ) : (
                            <span className="chip bg-violet-100 text-violet-800">Claim {b.insurance_claim_status}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <SectionTitle icon={ClipboardCheck} title="Insurance claims (FR38)" subtitle="Submitted claims awaiting or past approval" />
        {insuranceClaims.length === 0 ? (
          <EmptyState message="No insurance claims submitted" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {insuranceClaims.map((b) => {
              const apt = store.appointments.find((a) => a.id === b.appointment_id);
              const patient = apt && store.profiles.find((p) => p.id === apt.patient_id);
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold text-navy">{patient?.full_name ?? "—"} — ${b.amount.toFixed(2)}</p>
                    <p className="text-xs text-slate-500">
                      Claim {b.insurance_claim_number} · submitted {b.insurance_submitted_at ? format(parseISO(b.insurance_submitted_at), "d MMM yyyy") : "—"}
                    </p>
                    {b.insurance_note && <p className="text-xs text-slate-500">Note: {b.insurance_note}</p>}
                  </div>
                  {b.insurance_claim_status === "submitted" ? (
                    <ResolveClaimForm billId={b.id} />
                  ) : (
                    <span className={`chip ${b.insurance_claim_status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                      {b.insurance_claim_status}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <SectionTitle icon={FileClock} title="Paid receipts" subtitle="Real, downloadable PDF receipts" />
        <PaidReceiptsList />
      </div>
    </section>
  );
}

function InsuranceClaimForm({ billId }: { billId: string }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [claimNumber, setClaimNumber] = useState("");

  if (!open) {
    return (
      <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(true)}>Submit insurance claim</button>
    );
  }
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!claimNumber.trim()) return;
        store.submitInsuranceClaim(billId, claimNumber.trim());
        setOpen(false);
      }}
    >
      <input
        autoFocus value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)}
        placeholder="Claim #" className="input w-28 px-2 py-1 text-xs"
      />
      <button type="submit" className="btn-primary px-2 py-1 text-xs">Submit</button>
    </form>
  );
}

function ResolveClaimForm({ billId }: { billId: string }) {
  const store = useStore();
  const [note, setNote] = useState("");
  return (
    <div className="flex items-center gap-1.5">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="input w-32 px-2 py-1 text-xs" />
      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => store.resolveInsuranceClaim(billId, true, note)}>Approve</button>
      <button type="button" className="px-2 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700" onClick={() => store.resolveInsuranceClaim(billId, false, note)}>Reject</button>
    </div>
  );
}

function PaidReceiptsList() {
  const store = useStore();
  const paid = store.billing.filter((b) => b.payment_status === "paid" && b.receipt_url);

  if (paid.length === 0) return <EmptyState message="No paid receipts yet" />;

  return (
    <ul className="divide-y divide-slate-100">
      {paid.map((b) => {
        const apt = store.appointments.find((a) => a.id === b.appointment_id);
        const patient = apt && store.profiles.find((p) => p.id === apt.patient_id);
        return (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <span>{patient?.full_name ?? "—"} · ${b.amount.toFixed(2)} · {b.paid_at ? format(parseISO(b.paid_at), "d MMM yyyy") : "—"}</span>
            <button
              type="button"
              className="btn-ghost px-3 py-1 text-xs"
              onClick={() =>
                downloadReceiptPdf(`receipt-${b.id}.pdf`, [
                  "Capital Radiology — Payment Receipt",
                  "",
                  `Receipt: ${b.id}`,
                  `Patient: ${patient?.full_name ?? "—"}`,
                  `Procedure: ${apt?.body_part ?? "—"}`,
                  `Amount paid: $${b.amount.toFixed(2)}`,
                  `Payment method: ${b.payment_method ?? "—"}`,
                  `Paid at: ${b.paid_at ?? "—"}`,
                ])
              }
            >
              <Receipt size={13} aria-hidden /> Download PDF
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
function EquipmentPanel() {
  const store = useStore();
  const [showRegister, setShowRegister] = useState(false);
  const [showLog, setShowLog] = useState(false);

  return (
    <section id="equipment" className="card p-5 sm:p-6">
      <SectionTitle
        icon={Wrench}
        title="Equipment maintenance & calibration"
        subtitle="Machines past due are flagged and excluded from the technician's scanner list"
        action={
          <div className="flex gap-2">
            <button type="button" className="btn-ghost text-xs" onClick={() => setShowLog((v) => !v)}>
              {showLog ? "Hide service log" : "Service log"}
            </button>
            <button type="button" className="btn-primary text-xs" onClick={() => setShowRegister((v) => !v)}>
              <PlusCircle size={14} aria-hidden /> Register equipment
            </button>
          </div>
        }
      />
      {showRegister && <RegisterEquipmentForm onDone={() => setShowRegister(false)} />}
      {showLog && <EquipmentServiceLog />}
      <div className="grid gap-4 md:grid-cols-2">
        {store.equipment.map((eq) => {
          const daysToDue = differenceInCalendarDays(parseISO(eq.maintenance_due), new Date());
          const urgent = daysToDue <= 3;
          return (
            <article key={eq.id} className={`rounded-lg border p-4 ${urgent ? "border-rose-300 bg-rose-50/50" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-navy">{eq.machine_name}</h3>
                  <p className="text-xs text-slate-500">{eq.model}</p>
                </div>
                <StatusChip status={eq.status} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-slate-500">Last calibration</dt>
                  <dd className="font-semibold text-navy">{format(parseISO(eq.last_calibration), "d MMM yyyy")}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Maintenance due</dt>
                  <dd className={`font-semibold ${urgent ? "text-rose-700" : "text-navy"}`}>
                    {format(parseISO(eq.maintenance_due), "d MMM yyyy")}
                    {urgent && ` (${daysToDue < 0 ? "overdue" : `${daysToDue}d`})`}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Usage</dt>
                  <dd className="font-semibold text-navy">{eq.usage_hours.toLocaleString()} h</dd>
                </div>
              </dl>
              {(urgent || eq.status !== "operational") && (
                <button type="button" className="btn-primary mt-3 px-3 py-1.5 text-xs" onClick={() => store.scheduleEquipmentService(eq.id)}>
                  <Wrench size={14} aria-hidden /> Mark serviced & recalibrated
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RegisterEquipmentForm({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const [machineName, setMachineName] = useState("");
  const [model, setModel] = useState("");

  return (
    <form
      className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!machineName.trim() || !model.trim()) return;
        store.registerEquipment({ machine_name: machineName.trim(), model: model.trim() });
        setMachineName("");
        setModel("");
        onDone();
      }}
    >
      <div>
        <label htmlFor="eq-name" className="label">Machine name</label>
        <input id="eq-name" className="input" placeholder="e.g. MRI Suite D — 3T" value={machineName} onChange={(e) => setMachineName(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="eq-model" className="label">Model</label>
        <input id="eq-model" className="input" placeholder="e.g. Siemens MAGNETOM Vida" value={model} onChange={(e) => setModel(e.target.value)} required />
      </div>
      <div className="flex items-end">
        <button type="submit" className="btn-primary w-full text-xs">
          <PlusCircle size={14} aria-hidden /> Register (FR53)
        </button>
      </div>
    </form>
  );
}

function EquipmentServiceLog() {
  const store = useStore();
  const rows = [...store.equipmentServiceLog].sort((a, b) => (a.performed_at < b.performed_at ? 1 : -1));

  return (
    <div className="mb-4 max-h-64 overflow-y-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pl-3 pr-4">Machine</th>
            <th className="py-2 pr-4">Action</th>
            <th className="py-2 pr-4">Notes</th>
            <th className="py-2 pr-3">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const eq = store.equipment.find((e) => e.id === r.equipment_id);
            return (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pl-3 pr-4 font-semibold text-navy">{eq?.machine_name ?? r.equipment_id}</td>
                <td className="py-2 pr-4 capitalize">{r.action}</td>
                <td className="py-2 pr-4 text-slate-500">{r.notes ?? "—"}</td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">{format(parseISO(r.performed_at), "d MMM yyyy")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function AuditPanel() {
  const store = useStore();
  const [filter, setFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const actions = useMemo(
    () => Array.from(new Set(store.audit.map((a) => a.action))).sort(),
    [store.audit]
  );

  const rows = store.audit.filter((a) => {
    const matchesText =
      !filter ||
      a.user_name.toLowerCase().includes(filter.toLowerCase()) ||
      a.details.toLowerCase().includes(filter.toLowerCase()) ||
      a.entity.toLowerCase().includes(filter.toLowerCase());
    const matchesAction = actionFilter === "all" || a.action === actionFilter;
    return matchesText && matchesAction;
  });

  return (
    <section id="audit-log" className="card p-5 sm:p-6">
      <SectionTitle
        icon={ShieldCheck}
        title="Security audit log"
        subtitle="Append-only trail of every sensitive action — retained ≥ 12 months for compliance"
        action={
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="audit-search">Search audit log</label>
            <input
              id="audit-search" className="input w-48" placeholder="Search user or detail"
              value={filter} onChange={(e) => setFilter(e.target.value)}
            />
            <label className="sr-only" htmlFor="audit-action">Filter by action</label>
            <select id="audit-action" className="input w-44" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="all">All actions</option>
              {actions.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
        }
      />
      {rows.length === 0 ? (
        <EmptyState message="No entries match this filter" hint="Clear the search box or choose a different action." />
      ) : (
        <ol className="divide-y divide-slate-100">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 rounded-md p-1.5 ${a.action.includes("DENIED") ? "bg-rose-100 text-rose-700" : "bg-medical-light text-medical"}`}>
                  <Activity size={14} aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-navy">
                    <span className="font-mono text-xs">{a.action}</span> · {a.user_name}
                  </p>
                  <p className="text-xs text-slate-600">{a.details}</p>
                  <p className="text-[11px] text-slate-400">entity: {a.entity}</p>
                </div>
              </div>
              <time className="font-mono text-xs text-slate-500" dateTime={a.timestamp}>
                {format(parseISO(a.timestamp), "d MMM yyyy · HH:mm:ss")}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
