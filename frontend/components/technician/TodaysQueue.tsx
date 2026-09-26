"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Play, ScanLine } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { createClient } from "@/frontend/lib/supabase/client";
import { EmptyState, SectionTitle, StatusChip } from "@/frontend/components/shared/ui";
import type { AppointmentStatus, Contraindications } from "@/shared/types";

// Today's queue joined from real Supabase tables. Supabase's embedded-select
// shorthand (`profiles!appointments_patient_id_fkey(...)`) would need
// disambiguating FK-name hints for *every* one of the five profiles FKs on
// appointments (patient_id, referring_doctor_id, assigned_technician_id,
// assigned_radiologist_id, referral_reviewed_by) since none of those FK
// constraint names are declared anywhere in the migrations to confirm
// against a live schema — so this fetches appointments, then does one batched
// follow-up query each for profiles (patient/referring-doctor/assigned-tech
// names) and patient_medical_records (contraindications), and joins them in
// JS. Simpler and more robust than guessing embed syntax against an
// unreachable database.
export interface QueueAppointment {
  id: string;
  patient_id: string;
  date: string;
  time_slot: string;
  location: string;
  body_part: string;
  status: AppointmentStatus;
  referral_url: string | null;
  referring_doctor_id: string | null;
  referring_doctor_name: string | null;
  referring_doctor_practice: string | null;
  referral_reviewed: boolean;
  assigned_technician_id: string | null;
  patient_name: string;
  referring_doctor_display_name: string | null;
  assigned_technician_name: string | null;
  contraindications: Contraindications | null;
}

export function useTodaysQueue(todayStr: string) {
  const [queue, setQueue] = useState<QueueAppointment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: appointments, error } = await supabase
      .from("appointments")
      .select(
        "id, patient_id, date, time_slot, location, body_part, status, referral_url, referring_doctor_id, referring_doctor_name, referring_doctor_practice, referral_reviewed, assigned_technician_id"
      )
      .eq("date", todayStr)
      .in("status", ["scheduled", "in_progress"])
      .order("time_slot", { ascending: true });

    if (error) {
      setLoadError(error.message);
      return;
    }

    const rows = appointments ?? [];
    if (rows.length === 0) {
      setLoadError(null);
      setQueue([]);
      return;
    }

    const patientIds = Array.from(new Set(rows.map((a) => a.patient_id)));
    const otherProfileIds = Array.from(
      new Set(
        rows
          .flatMap((a) => [a.referring_doctor_id, a.assigned_technician_id])
          .filter((id): id is string => Boolean(id))
      )
    );
    const profileIds = Array.from(new Set([...patientIds, ...otherProfileIds]));

    const [profilesRes, recordsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", profileIds),
      supabase.from("patient_medical_records").select("patient_id, contraindications").in("patient_id", patientIds),
    ]);

    if (profilesRes.error) {
      setLoadError(profilesRes.error.message);
      return;
    }
    if (recordsRes.error) {
      setLoadError(recordsRes.error.message);
      return;
    }

    const nameById = new Map((profilesRes.data ?? []).map((p) => [p.id as string, p.full_name as string]));
    const contraindicationsByPatient = new Map(
      (recordsRes.data ?? []).map((r) => [r.patient_id as string, r.contraindications as Contraindications])
    );

    setLoadError(null);
    setQueue(
      rows.map((a) => ({
        ...a,
        patient_name: nameById.get(a.patient_id) ?? "Unknown patient",
        referring_doctor_display_name: a.referring_doctor_id
          ? nameById.get(a.referring_doctor_id) ?? "Unknown doctor"
          : null,
        assigned_technician_name: a.assigned_technician_id ? nameById.get(a.assigned_technician_id) ?? null : null,
        contraindications: contraindicationsByPatient.get(a.patient_id) ?? null,
      }))
    );
  }, [todayStr]);

  useEffect(() => {
    load();
  }, [load]);

  return { queue, loadError, reload: load };
}

// "Log completed scan" navigates to /dashboard/scan-logger?appointment=<id>
// instead of setting local state — the queue and scan logger are now
// separate routes (previously two sections of the same TechnicianPortal
// page), so cross-linking goes through the URL instead of shared state.
export default function TodaysQueue() {
  const store = useStore();
  const router = useRouter();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { queue, loadError, reload } = useTodaysQueue(todayStr);

  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const todaysQueue = queue ?? [];

  async function startScan(appointmentId: string) {
    setRowBusyId(appointmentId);
    setRowErrors((e) => ({ ...e, [appointmentId]: "" }));
    const supabase = createClient();
    const { error } = await supabase.from("appointments").update({ status: "in_progress" }).eq("id", appointmentId);
    setRowBusyId(null);
    if (error) {
      setRowErrors((e) => ({ ...e, [appointmentId]: error.message }));
      return;
    }
    reload();
  }

  async function markReferralReviewed(appointmentId: string) {
    setRowBusyId(appointmentId);
    setRowErrors((e) => ({ ...e, [appointmentId]: "" }));
    const supabase = createClient();
    const { error } = await supabase
      .from("appointments")
      .update({
        referral_reviewed: true,
        referral_reviewed_by: store.currentUser.id,
        referral_reviewed_at: new Date().toISOString(),
      })
      .eq("id", appointmentId);
    setRowBusyId(null);
    if (error) {
      setRowErrors((e) => ({ ...e, [appointmentId]: error.message }));
      return;
    }
    reload();
  }

  return (
    <section id="today-s-queue" className="card p-5 sm:p-6">
      <SectionTitle
        icon={CalendarClock}
        title={`Today's MRI queue — ${format(new Date(), "EEEE d MMMM")}`}
        subtitle={`${todaysQueue.length} patient${todaysQueue.length === 1 ? "" : "s"} scheduled or in progress`}
      />
      {loadError && (
        <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Could not load today&apos;s queue: {loadError}
        </p>
      )}
      {!queue && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : todaysQueue.length === 0 ? (
        <EmptyState
          message="No scans left in today's queue"
          hint="New online bookings for today will appear here automatically."
        />
      ) : (
        <ul className="space-y-3">
          {todaysQueue.map((a) => {
            const flags = a.contraindications
              ? (Object.entries(a.contraindications) as [string, boolean | string | null][])
                  .filter(([k, v]) => k !== "other" && v === true)
                  .map(([k]) => k.replace(/_/g, " "))
              : [];
            if (a.contraindications?.other) flags.push(a.contraindications.other);

            const referringLabel = a.referring_doctor_id ? a.referring_doctor_display_name : a.referring_doctor_name;
            const hasReferralToCheck = Boolean(a.referral_url || a.referring_doctor_name);
            const busy = rowBusyId === a.id;

            return (
              <li key={a.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy">
                      {a.time_slot} — {a.patient_name} · {a.body_part}
                    </p>
                    <p className="text-xs text-slate-500">{a.location}</p>
                    {a.assigned_technician_id && (
                      <p className="mt-1 text-xs font-semibold text-medical">
                        {a.assigned_technician_id === store.currentUser.id
                          ? "Assigned to you"
                          : `Assigned to ${a.assigned_technician_name ?? "another technician"}`}
                      </p>
                    )}
                    {referringLabel && (
                      <p className="mt-1 text-xs text-slate-500">
                        Referred by {referringLabel}
                        {a.referring_doctor_practice && ` · ${a.referring_doctor_practice}`}
                        {!a.referring_doctor_id && (
                          <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            No account yet
                          </span>
                        )}
                      </p>
                    )}
                    {flags.length > 0 && (
                      <p className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                        <AlertTriangle size={13} aria-hidden />
                        Safety flags: {flags.join(", ")}
                      </p>
                    )}
                    {hasReferralToCheck &&
                      (a.referral_reviewed ? (
                        <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                          <CheckCircle2 size={13} aria-hidden /> Referral reviewed
                        </p>
                      ) : (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                            <AlertTriangle size={13} aria-hidden /> Referral needs review
                          </span>
                          <button
                            type="button"
                            className="btn-ghost text-xs"
                            disabled={busy}
                            onClick={() => markReferralReviewed(a.id)}
                          >
                            <CheckCircle2 size={13} aria-hidden /> {busy ? "Saving…" : "Mark reviewed"}
                          </button>
                        </div>
                      ))}
                    {rowErrors[a.id] && (
                      <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-700">{rowErrors[a.id]}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusChip status={a.status} />
                    {a.status === "scheduled" ? (
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        disabled={busy}
                        onClick={() => startScan(a.id)}
                      >
                        <Play size={14} aria-hidden /> {busy ? "Starting…" : "Start scan"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary text-xs"
                        onClick={() => router.push(`/dashboard/scan-logger?appointment=${a.id}`)}
                      >
                        <ScanLine size={14} aria-hidden /> Log completed scan
                      </button>
                    )}
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
