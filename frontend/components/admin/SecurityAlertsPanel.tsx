"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertOctagon, Loader2, ShieldAlert } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";

interface SecurityEvent {
  id: string;
  event_type: string;
  email: string | null;
  detail: string | null;
  created_at: string;
}

const SUSPICIOUS_THRESHOLD = 3;
const SUSPICIOUS_WINDOW_MINUTES = 15;

// Reads the real security_events table (backend/database/007_consent_deletion_security.sql)
// — failed logins are written by an anonymous RPC (app/login/page.tsx calls
// it before a session exists), so this can't be mock-store state the way
// most of the dashboard is. NFR10 asks the system to "detect and alert
// administrators about suspicious or unauthorised access attempts"; the
// detection here is a simple, transparent rule (N+ failed logins for the
// same email within a short window) rather than a black-box model — good
// enough to demonstrate the requirement without pretending to be a real
// intrusion-detection system.
export default function SecurityAlertsPanel() {
  const [events, setEvents] = useState<SecurityEvent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("security_events")
      .select("id, event_type, email, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setEvents((data ?? []) as SecurityEvent[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const alerts = useMemo(() => {
    if (!events) return [];
    const windowMs = SUSPICIOUS_WINDOW_MINUTES * 60 * 1000;
    const byEmail = new Map<string, SecurityEvent[]>();
    events
      .filter((e) => e.event_type === "failed_login" && e.email)
      .forEach((e) => {
        const key = e.email as string;
        byEmail.set(key, [...(byEmail.get(key) ?? []), e]);
      });

    const result: { email: string; count: number; latest: string }[] = [];
    byEmail.forEach((list, email) => {
      const sorted = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const latest = new Date(sorted[0].created_at).getTime();
      const withinWindow = sorted.filter((e) => latest - new Date(e.created_at).getTime() <= windowMs);
      if (withinWindow.length >= SUSPICIOUS_THRESHOLD) {
        result.push({ email, count: withinWindow.length, latest: sorted[0].created_at });
      }
    });
    return result.sort((a, b) => (a.latest < b.latest ? 1 : -1));
  }, [events]);

  return (
    <section id="security-alerts" className="card p-5 sm:p-6">
      <SectionTitle
        icon={ShieldAlert}
        title="Security alerts"
        subtitle={`Accounts with ${SUSPICIOUS_THRESHOLD}+ failed logins within ${SUSPICIOUS_WINDOW_MINUTES} minutes (NFR10)`}
      />
      {loadError && <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">Could not load security events: {loadError}</p>}
      {events === null && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" aria-hidden /> Loading…</p>
      ) : alerts.length === 0 ? (
        <EmptyState message="No suspicious login activity detected" />
      ) : (
        <ul className="mb-4 space-y-2">
          {alerts.map((a) => (
            <li key={a.email} className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-900">
              <AlertOctagon size={16} className="shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">{a.email}</span> — {a.count} failed logins, most recently {format(parseISO(a.latest), "d MMM, h:mm a")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {events && events.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500">View recent security events ({events.length})</summary>
          <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
                <span className="text-slate-600">{e.event_type} — {e.email ?? "unknown"} {e.detail ? `(${e.detail})` : ""}</span>
                <time className="font-mono text-slate-400">{format(parseISO(e.created_at), "d MMM, HH:mm:ss")}</time>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
