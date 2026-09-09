"use client";

import React, { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Building2, Check, Loader2, Stethoscope, X } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";
import type { ReferringDoctorRequest } from "@/shared/types";
import { EmptyState, SectionTitle, StatusChip } from "@/frontend/components/shared/ui";

// Unlike every other panel on this dashboard, this one talks to Supabase
// directly instead of the mock `useStore()` state. That's deliberate, not an
// inconsistency: a referring-doctor request is submitted by an external,
// unauthenticated visitor (app/request-doctor-access) in a browser session
// that has no relationship to this session, and approving it has to
// provision a real auth account via a server-side, service-role call (see
// app/api/admin/doctor-requests/[id]/approve). None of that can be
// represented by in-memory React state shared only within one tab — it
// needs the real, persisted queue in `referring_doctor_requests`.
//
// Only rendered inside SuperAdminDashboard (see backend/database/008_super_admin.sql)
// — RLS on this table now requires is_super_admin(), so a regular admin
// session would just get empty/denied reads if this were shown to them.
export default function DoctorRequestsPanel() {
  const [requests, setRequests] = useState<ReferringDoctorRequest[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("referring_doctor_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setRequests((data ?? []) as ReferringDoctorRequest[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = requests?.filter((r) => r.status === "pending") ?? [];
  const reviewed = requests?.filter((r) => r.status !== "pending") ?? [];

  return (
    <section id="doctor-requests" className="card p-5 sm:p-6">
      <SectionTitle
        icon={Stethoscope}
        title="Referring doctor access requests"
        subtitle="External doctors request access here — internal staff accounts are created via Staff accounts above"
      />

      {loadError && (
        <p role="alert" className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Could not load requests: {loadError}
        </p>
      )}

      {requests === null && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : pending.length === 0 ? (
        <EmptyState message="No pending requests" hint="New referring-doctor requests will appear here for review." />
      ) : (
        <ul className="space-y-4">
          {pending.map((request) => (
            <PendingRequestRow key={request.id} request={request} onResolved={load} />
          ))}
        </ul>
      )}

      {reviewed.length > 0 && (
        <div className="mt-6 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recently reviewed</p>
          <ul className="divide-y divide-slate-100">
            {reviewed.slice(0, 10).map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <span className="font-semibold text-navy">{request.full_name}</span>{" "}
                  <span className="text-slate-500">— {request.practice_name}</span>
                  {request.status === "rejected" && request.rejection_reason && (
                    <p className="text-xs text-slate-500">Reason: {request.rejection_reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={request.status} />
                  {request.reviewed_at && (
                    <time className="text-xs text-slate-400" dateTime={request.reviewed_at}>
                      {format(parseISO(request.reviewed_at), "d MMM yyyy")}
                    </time>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
function PendingRequestRow({
  request,
  onResolved,
}: {
  request: ReferringDoctorRequest;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/doctor-requests/${request.id}/approve`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not approve this request.");
        return;
      }
      onResolved();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!reason.trim()) {
      setError("Enter a reason for the rejection.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/doctor-requests/${request.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not reject this request.");
        return;
      }
      onResolved();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-navy">{request.full_name}</p>
          <p className="text-sm text-slate-600">{request.email}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <Building2 size={12} aria-hidden /> {request.practice_name} · AHPRA {request.ahpra_number}
            {request.phone && <> · {request.phone}</>}
          </p>
          {request.message && <p className="mt-2 text-sm text-slate-600">&ldquo;{request.message}&rdquo;</p>}
          <p className="mt-1 text-[11px] text-slate-400">
            Submitted {format(parseISO(request.created_at), "d MMM yyyy, h:mm a")}
          </p>
        </div>

        {!rejecting && (
          <div className="flex shrink-0 gap-2">
            <button type="button" disabled={busy} onClick={approve} className="btn-primary px-3 py-1.5 text-xs">
              <Check size={14} aria-hidden /> Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(true)}
              className="btn-ghost px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
            >
              <X size={14} aria-hidden /> Reject
            </button>
          </div>
        )}
      </div>

      {rejecting && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <label htmlFor={`reject-reason-${request.id}`} className="mb-1 block text-xs font-semibold text-slate-600">
            Reason for rejection
          </label>
          <textarea
            id={`reject-reason-${request.id}`}
            rows={2}
            className="input w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Could not verify AHPRA registration"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={reject}
              className="btn-primary bg-rose-600 px-3 py-1.5 text-xs hover:bg-rose-700"
            >
              {busy ? "Rejecting…" : "Confirm rejection"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRejecting(false);
                setReason("");
                setError(null);
              }}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
    </li>
  );
}
