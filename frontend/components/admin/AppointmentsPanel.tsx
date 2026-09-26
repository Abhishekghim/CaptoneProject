"use client";

import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ClipboardCheck, Loader2, UserCog, XCircle } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";
import { notifyPatient } from "@/frontend/lib/notify";
import AppointmentManageForm from "@/frontend/components/shared/AppointmentManageForm";
import { EmptyState, SectionTitle, StatusChip } from "@/frontend/components/shared/ui";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import { useProfiles } from "@/frontend/lib/hooks/useProfiles";
import type { Appointment } from "@/shared/types";

function Loading() {
  return (
    <p className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
    </p>
  );
}

// Relocated from AdminDashboard.tsx (was inline lines 90-233) as part of the
// admin route split — logic unchanged, still consumed by AdminDashboard.tsx
// itself (which SuperAdminDashboard.tsx renders wholesale) as well as
// app/(app)/dashboard/appointments/page.tsx's admin branch.
export default function AppointmentsPanel() {
  const { data: appointments, loadError: aptLoadError, reload: reloadAppointments } = useAppointments();
  const { data: profiles, loadError: profilesLoadError } = useProfiles();
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Appointment["status"]>("all");
  const [managingId, setManagingId] = useState<string | null>(null);
  const [cancelErrors, setCancelErrors] = useState<Record<string, string>>({});

  async function cancelAppointment(a: Appointment, patientName: string) {
    if (!confirm(`Cancel ${patientName}'s ${a.body_part} appointment?`)) return;
    setCancelErrors((e) => ({ ...e, [a.id]: "" }));
    const supabase = createClient();
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled", cancellation_reason: a.cancellation_reason })
      .eq("id", a.id);
    if (error) {
      setCancelErrors((e) => ({ ...e, [a.id]: error.message }));
      return;
    }
    reloadAppointments();
    notifyPatient(
      a.patient_id,
      "appointment_cancelled",
      "Appointment cancelled",
      `<p>Your ${a.body_part} MRI on ${a.date} at ${a.time_slot} has been cancelled.</p>`,
      a.id
    );
  }

  const rows = useMemo(() => {
    return (appointments ?? [])
      .filter((a) => statusFilter === "all" || a.status === statusFilter)
      .filter((a) => {
        if (!filter) return true;
        const patient = (profiles ?? []).find((p) => p.id === a.patient_id);
        const needle = filter.toLowerCase();
        return (
          patient?.full_name.toLowerCase().includes(needle) ||
          a.body_part.toLowerCase().includes(needle) ||
          a.location.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [appointments, profiles, filter, statusFilter]);

  const technicians = (profiles ?? []).filter((p) => p.role === "technician");
  const radiologists = (profiles ?? []).filter((p) => p.role === "radiologist");
  const loadError = aptLoadError || profilesLoadError;
  const loading = (!appointments || !profiles) && !loadError;

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
      {loadError && (
        <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Could not load appointments: {loadError}
        </p>
      )}
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState message="No appointments match this filter" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((a) => {
            const patient = (profiles ?? []).find((p) => p.id === a.patient_id);
            const technician = a.assigned_technician_id ? (profiles ?? []).find((p) => p.id === a.assigned_technician_id) : null;
            const radiologist = a.assigned_radiologist_id ? (profiles ?? []).find((p) => p.id === a.assigned_radiologist_id) : null;
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
                        onClick={() => cancelAppointment(a, patient?.full_name ?? "this patient")}
                      >
                        <XCircle size={13} aria-hidden /> Cancel
                      </button>
                    )}
                  </div>
                </div>
                {cancelErrors[a.id] && (
                  <p role="alert" className="mt-1 text-[11px] font-semibold text-rose-700">{cancelErrors[a.id]}</p>
                )}
                {managing && <AppointmentManageForm appointment={a} technicians={technicians} radiologists={radiologists} onDone={() => setManagingId(null)} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
