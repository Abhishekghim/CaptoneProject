"use client";

import React, { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, Trash2, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, SectionTitle } from "@/components/shared/ui";

interface DeletionRow {
  id: string;
  full_name: string;
  email: string;
  deletion_requested_at: string;
}

// Reads straight from Supabase, same as DoctorRequestsPanel — this queue is
// keyed off profiles.deletion_requested_at (real column, real RLS), not the
// mock store, and the actual removal happens server-side via service role
// (see app/api/admin/account-deletions/[id]/delete).
export default function AccountDeletionRequestsPanel() {
  const [rows, setRows] = useState<DeletionRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, deletion_requested_at")
      .not("deletion_requested_at", "is", null)
      .order("deletion_requested_at", { ascending: false });

    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setRows((data ?? []) as DeletionRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section id="account-deletions" className="card p-5 sm:p-6">
      <SectionTitle icon={UserX} title="Account deletion requests" subtitle="Patients who requested their account and data be removed (NFR36)" />
      {loadError && <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">Could not load requests: {loadError}</p>}
      {!rows && loadError ? null : !rows ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" aria-hidden /> Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState message="No pending deletion requests" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <DeletionRowItem key={r.id} row={r} onResolved={load} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DeletionRowItem({ row, onResolved }: { row: DeletionRow; onResolved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dismiss() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("profiles").update({ deletion_requested_at: null }).eq("id", row.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onResolved();
  }

  async function deletePermanently() {
    if (!confirm(`Permanently delete ${row.full_name}'s account and all associated data? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/account-deletions/${row.id}/delete`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not delete this account.");
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
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className="font-semibold text-navy">{row.full_name}</p>
        <p className="text-xs text-slate-500">{row.email} · requested {format(parseISO(row.deletion_requested_at), "d MMM yyyy")}</p>
        {error && <p className="mt-1 text-xs font-semibold text-rose-700">{error}</p>}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={dismiss} className="btn-ghost px-3 py-1.5 text-xs">Dismiss</button>
        <button type="button" disabled={busy} onClick={deletePermanently} className="btn-primary bg-rose-600 px-3 py-1.5 text-xs hover:bg-rose-700">
          <Trash2 size={13} aria-hidden /> Delete permanently
        </button>
      </div>
    </li>
  );
}
