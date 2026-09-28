"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText, Loader2, XCircle } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";
import { getSignedUrl } from "@/frontend/lib/storage";
import { notifyPatient } from "@/frontend/lib/notify";
import { useProfiles } from "@/frontend/lib/hooks/useProfiles";
import { useMedicalRecords } from "@/frontend/lib/hooks/useMedicalRecords";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";
import type { Appointment } from "@/shared/types";

interface UsedReferral {
  used_in_appointment_id: string;
  body_part: string;
  patient_dob: string | null;
  notes: string | null;
  created_at: string;
}

// Everything here is readable by staff under existing RLS; approving or
// declining goes through review_booking, which re-checks the caller's role.
function usePendingReviews(doctorId?: string) {
  const [rows, setRows] = useState<Appointment[] | null>(null);
  const [referrals, setReferrals] = useState<UsedReferral[]>([]);
  const [externalDoctorIds, setExternalDoctorIds] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    let query = supabase.from("appointments").select("*").eq("booking_review_status", "pending").eq("status", "scheduled");
    if (doctorId) query = query.eq("referring_doctor_id", doctorId);
    const { data, error } = await query.order("date", { ascending: true }).order("time_slot", { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    const pending = (data ?? []) as Appointment[];
    const ids = pending.map((a) => a.id);
    const doctorIds = Array.from(new Set(pending.map((a) => a.referring_doctor_id).filter(Boolean))) as string[];

    const [refRes, detailsRes] = await Promise.all([
      ids.length
        ? supabase
            .from("doctor_referrals")
            .select("used_in_appointment_id, body_part, patient_dob, notes, created_at")
            .in("used_in_appointment_id", ids)
        : Promise.resolve({ data: [], error: null }),
      doctorIds.length
        ? supabase.from("referring_doctor_details").select("profile_id").in("profile_id", doctorIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const secondaryError = refRes.error?.message ?? detailsRes.error?.message ?? null;
    setLoadError(secondaryError);
    setReferrals((refRes.data ?? []) as UsedReferral[]);
    setExternalDoctorIds(new Set(((detailsRes.data ?? []) as { profile_id: string }[]).map((d) => d.profile_id)));
    setRows(pending);
  }, [doctorId]);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, referrals, externalDoctorIds, loadError, reload: load };
}

// doctorId: show only bookings that name this (internal) referring doctor.
export default function BookingReviewQueue({ focusId, doctorId }: { focusId?: string | null; doctorId?: string }) {
  const { rows, referrals, externalDoctorIds, loadError, reload } = usePendingReviews(doctorId);
  const { data: profiles } = useProfiles();
  const { data: records } = useMedicalRecords();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  const profileById = useMemo(() => new Map((profiles ?? []).map((p) => [p.id, p])), [profiles]);
  const recordByPatient = useMemo(() => new Map((records ?? []).map((r) => [r.patient_id, r])), [records]);

  useEffect(() => {
    if (!focusId || !rows) return;
    document.getElementById(`review-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId, rows]);

  async function openReferral(a: Appointment) {
    if (!a.referral_url) return;
    const url = await getSignedUrl(a.referral_url);
    if (!url) {
      setRowErrors((e) => ({ ...e, [a.id]: "Could not open the referral document." }));
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function decide(a: Appointment, decision: "approve" | "decline") {
    const reason = declining[a.id]?.trim() ?? "";
    if (decision === "decline" && !reason) {
      setRowErrors((e) => ({ ...e, [a.id]: "Give a reason for declining — the patient will see it." }));
      return;
    }
    setBusyId(a.id);
    setRowErrors((e) => ({ ...e, [a.id]: "" }));
    const supabase = createClient();
    const { error } = await supabase.rpc("review_booking", {
      p_appointment_id: a.id,
      p_decision: decision,
      p_reason: decision === "decline" ? reason : null,
    });
    setBusyId(null);
    if (error) {
      setRowErrors((e) => ({ ...e, [a.id]: error.message }));
      reload();
      return;
    }

    const when = `${a.body_part} MRI on ${a.date} at ${a.time_slot}, ${a.location}`;
    // Email is best effort: the decision and the in-app notification are
    // already saved by review_booking whether or not this succeeds.
    if (decision === "approve") {
      notifyPatient(a.patient_id, "appointment_confirmed", "Appointment confirmed", `<p>Your referral has been checked. ${when} is confirmed.</p>`, a.id);
    } else {
      notifyPatient(
        a.patient_id,
        "appointment_declined",
        "Appointment not confirmed",
        `<p>${when} could not be confirmed: ${escapeHtml(reason)}</p><p>The time has been released. Please contact the clinic or book again.</p>`,
        a.id
      );
    }
    const patientName = profileById.get(a.patient_id)?.full_name ?? "the patient";
    setDone(decision === "approve" ? `Confirmed ${patientName}'s ${a.body_part} MRI.` : `Declined ${patientName}'s booking and released the slot.`);
    reload();
  }

  return (
    <section className="card p-5 sm:p-6">
      <SectionTitle
        icon={ClipboardCheck}
        title={doctorId ? "Booking approvals" : "Booking reviews"}
        subtitle={
          doctorId
            ? "Your patients' bookings, holding a slot until you approve the referral"
            : "Bookings that are holding a slot until their referral is checked"
        }
      />
      {loadError && (
        <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Could not load pending reviews: {loadError}
        </p>
      )}
      {done && (
        <p role="status" className="mb-3 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 size={15} aria-hidden /> {done}
        </p>
      )}
      {!rows && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : (rows ?? []).length === 0 ? (
        <EmptyState message="No bookings waiting for review" hint="New bookings that need a referral check will appear here." />
      ) : (
        <ul className="space-y-4">
          {(rows ?? []).map((a) => {
            const patient = profileById.get(a.patient_id);
            const record = recordByPatient.get(a.patient_id);
            const systemReferral = referrals.find((r) => r.used_in_appointment_id === a.id);
            const doctor = a.referring_doctor_id ? profileById.get(a.referring_doctor_id) : undefined;
            const flags = record
              ? (Object.entries(record.contraindications) as [string, boolean | string | null][])
                  .filter(([k, v]) => k !== "other" && v === true)
                  .map(([k]) => k.replace(/_/g, " "))
              : [];
            if (record?.contraindications.other) flags.push(record.contraindications.other);
            const busy = busyId === a.id;

            return (
              <li
                key={a.id}
                id={`review-${a.id}`}
                className={`rounded-xl border p-4 ${focusId === a.id ? "border-medical ring-2 ring-medical/30" : "border-slate-200"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy">
                      {patient?.full_name ?? "Unknown patient"} · {a.body_part} MRI
                    </p>
                    <p className="text-sm text-slate-600">
                      {format(parseISO(a.date), "EEE d MMM yyyy")} at {a.time_slot} · {a.location}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Booked {format(parseISO(a.created_at), "d MMM, h:mm a")}
                    </p>
                  </div>
                  <span className="chip bg-amber-100 text-amber-800">Slot reserved · not confirmed</span>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Identity</dt>
                    <dd className="text-slate-700">
                      DOB {record?.dob ? format(parseISO(record.dob), "d MMM yyyy") : <span className="text-rose-600">not on file</span>}
                      {patient?.phone && <> · {patient.phone}</>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Referring doctor</dt>
                    <dd className="text-slate-700">
                      {doctor ? (
                        <>
                          {doctor.full_name}{" "}
                          <span className="chip bg-slate-100 text-slate-600">
                            {externalDoctorIds.has(doctor.id) ? "Registered external doctor" : "Registered clinic doctor"}
                          </span>
                        </>
                      ) : a.referring_doctor_name || a.referring_doctor_practice ? (
                        <>
                          {[a.referring_doctor_name, a.referring_doctor_practice].filter(Boolean).join(" · ")}{" "}
                          <span className="chip bg-slate-100 text-slate-600">Not registered</span>
                        </>
                      ) : (
                        <span className="text-slate-500">Not provided — check the referral document</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Referral</dt>
                    <dd className="flex flex-wrap items-center gap-2 text-slate-700">
                      {a.referral_url && (
                        <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => openReferral(a)}>
                          <FileText size={13} aria-hidden /> Open uploaded referral
                        </button>
                      )}
                      {systemReferral && (
                        <span className="text-xs">
                          Sent through the portal on {format(parseISO(systemReferral.created_at), "d MMM yyyy")} for{" "}
                          {systemReferral.body_part}
                          {systemReferral.patient_dob && <> (DOB given: {format(parseISO(systemReferral.patient_dob), "d MMM yyyy")})</>}
                          {systemReferral.notes && <> — &ldquo;{systemReferral.notes}&rdquo;</>}
                        </span>
                      )}
                      {!a.referral_url && !systemReferral && <span className="text-rose-600">No referral attached</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Health &amp; safety</dt>
                    <dd className="text-slate-700">
                      {flags.length > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                          <AlertTriangle size={13} aria-hidden /> {flags.join(", ")}
                        </span>
                      ) : record ? (
                        "No safety flags recorded"
                      ) : (
                        <span className="text-rose-600">No health profile on file</span>
                      )}
                      {record?.history && <span className="block text-xs text-slate-500">History: {record.history}</span>}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
                  <button type="button" className="btn-primary text-xs" disabled={busy} onClick={() => decide(a, "approve")}>
                    <CheckCircle2 size={14} aria-hidden /> {busy ? "Saving…" : "Approve and confirm"}
                  </button>
                  <div className="flex min-w-[16rem] flex-1 flex-wrap items-end gap-2">
                    <label className="flex-1 text-xs text-slate-500">
                      Reason for declining
                      <input
                        className="input mt-1"
                        value={declining[a.id] ?? ""}
                        onChange={(e) => setDeclining((d) => ({ ...d, [a.id]: e.target.value }))}
                        placeholder="e.g. Referral is for a different body part"
                      />
                    </label>
                    <button type="button" className="btn-ghost text-xs text-rose-700" disabled={busy} onClick={() => decide(a, "decline")}>
                      <XCircle size={14} aria-hidden /> Decline
                    </button>
                  </div>
                </div>
                {rowErrors[a.id] && (
                  <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{rowErrors[a.id]}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
