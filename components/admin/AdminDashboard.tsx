"use client";

import React, { useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  Activity, BadgeDollarSign, CalendarClock, FileClock, LayoutDashboard,
  Receipt, ScanLine, ShieldCheck, Wrench,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { EmptyState, SectionTitle, StatCard, StatusChip } from "@/components/shared/ui";
import DoctorRequestsPanel from "./DoctorRequestsPanel";

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

      <BillingPanel />
      <DoctorRequestsPanel />
      <EquipmentPanel />
      <AuditPanel />
    </div>
  );
}

/* ------------------------------------------------------------------ */
function BillingPanel() {
  const store = useStore();
  const open = store.billing.filter((b) => b.payment_status !== "paid" && b.payment_status !== "refunded");

  return (
    <section className="card p-5 sm:p-6">
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
                      <div className="flex gap-2">
                        <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => store.markBillPaid(b.id, "card")}>Card</button>
                        <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => store.markBillPaid(b.id, "insurance")}>Insurance</button>
                      </div>
                    </td>
                  </tr>
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
function EquipmentPanel() {
  const store = useStore();

  return (
    <section id="equipment" className="card p-5 sm:p-6">
      <SectionTitle
        icon={Wrench}
        title="Equipment maintenance & calibration"
        subtitle="Machines past due are flagged and excluded from the technician's scanner list"
      />
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
