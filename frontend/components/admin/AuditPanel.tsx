"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Activity, Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";
import { useProfiles } from "@/frontend/lib/hooks/useProfiles";

// Relocated from AdminDashboard.tsx (was inline lines 805-953) as part of the
// admin route split — logic unchanged.
//
// Real audit_logs read (audit_admin_read RLS — admin/super_admin only,
// matching who this panel is shown to). Capped at 200 most-recent rows:
// this table is append-only and can grow large, and the panel has no
// pagination UI, so an unbounded fetch would only get slower over time
// without giving the admin any way to see "page 2" anyway.
interface AuditLogRow {
  id: number;
  user_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  timestamp: string;
}

function useAuditLogs() {
  const [data, setData] = useState<AuditLogRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: rows, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(200);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setData((rows ?? []) as AuditLogRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loadError, reload: load };
}

// audit_logs.details is jsonb, not the mock's plain string. Table-write
// rows (from write_audit()) hold a full row snapshot as {old:{...}} or
// {new:{...}}; the one non-table event this app logs — the AI assistant
// widget's query event, RPC'd via log_action() (backend/database/028) —
// holds {summary: "..."} instead. Prefer that human-readable summary when
// present, otherwise fall back to a (length-capped) JSON dump.
function describeAuditDetails(details: Record<string, unknown> | null): string {
  if (!details) return "—";
  if (typeof details.summary === "string") return details.summary;
  try {
    const text = JSON.stringify(details);
    if (!text || text === "{}") return "—";
    return text.length > 220 ? `${text.slice(0, 220)}…` : text;
  } catch {
    return "—";
  }
}

export default function AuditPanel() {
  const { data: logs, loadError } = useAuditLogs();
  const { data: profiles } = useProfiles();
  const [filter, setFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const decorated = useMemo(
    () =>
      (logs ?? []).map((a) => ({
        ...a,
        userName: a.user_id ? (profiles ?? []).find((p) => p.id === a.user_id)?.full_name ?? a.user_id : "System",
        detailsText: describeAuditDetails(a.details),
      })),
    [logs, profiles]
  );

  const actions = useMemo(() => Array.from(new Set(decorated.map((a) => a.action))).sort(), [decorated]);

  const rows = decorated.filter((a) => {
    const needle = filter.toLowerCase();
    const matchesText =
      !filter ||
      a.userName.toLowerCase().includes(needle) ||
      a.detailsText.toLowerCase().includes(needle) ||
      (a.entity ?? "").toLowerCase().includes(needle);
    const matchesAction = actionFilter === "all" || a.action === actionFilter;
    return matchesText && matchesAction;
  });

  const loading = !logs && !loadError;

  return (
    <section id="audit-log" className="card p-5 sm:p-6">
      <SectionTitle
        icon={ShieldCheck}
        title="Security audit log"
        subtitle="Append-only trail of every sensitive action — most recent 200 entries, retained ≥ 12 months for compliance"
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
      {loadError && (
        <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Could not load audit log: {loadError}
        </p>
      )}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : rows.length === 0 ? (
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
                    <span className="font-mono text-xs">{a.action}</span> · {a.userName}
                  </p>
                  <p className="text-xs text-slate-600">{a.detailsText}</p>
                  <p className="text-[11px] text-slate-400">entity: {a.entity ?? "—"}{a.entity_id ? ` (${a.entity_id})` : ""}</p>
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
