"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { FileCheck, Loader2 } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";
import { useScans } from "@/frontend/lib/hooks/useScans";
import { useReports } from "@/frontend/lib/hooks/useReports";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import { useProfiles } from "@/frontend/lib/hooks/useProfiles";

// Finalized reports have nowhere else to be reached from once they drop out
// of /dashboard/unreported's list (that page only shows draft/missing
// reports, by design) — this is that missing entry point. Reuses
// /dashboard/read as-is: ReportEditor already renders a full read-only
// "finalized and immutable, signed: X" view when the report's status is
// finalized, so no changes were needed there, just a way back in.
export default function ReportsPage() {
  const { effectiveRole } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "radiologist") router.replace("/dashboard");
  }, [effectiveRole, router]);

  const { data: scans, loadError: scansLoadError } = useScans();
  const { data: reports, loadError: reportsLoadError } = useReports();
  const { data: appointments, loadError: aptLoadError } = useAppointments();
  const { data: profiles, loadError: profilesLoadError } = useProfiles();

  const finalized = useMemo(
    () =>
      (scans ?? [])
        .map((s) => ({ scan: s, report: (reports ?? []).find((r) => r.scan_id === s.id) }))
        .filter((x) => x.report?.status === "finalized")
        .sort((a, b) => (b.report!.finalized_at ?? "").localeCompare(a.report!.finalized_at ?? "")),
    [scans, reports]
  );

  const loadError = scansLoadError || reportsLoadError || aptLoadError || profilesLoadError;
  const loading = (!scans || !reports || !appointments || !profiles) && !loadError;

  if (effectiveRole !== "radiologist") return null;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section id="reports" className="card p-5 sm:p-6">
        <SectionTitle
          icon={FileCheck}
          title="Reports"
          subtitle={`${finalized.length} finalized report${finalized.length === 1 ? "" : "s"}`}
        />
        {loadError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load reports: {loadError}
          </p>
        )}
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
          </p>
        ) : finalized.length === 0 ? (
          <EmptyState message="No finalized reports yet" hint="Reports appear here once you sign them off in Read & report." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {finalized.map(({ scan: s, report }) => {
              const apt = (appointments ?? []).find((a) => a.id === s.appointment_id);
              const patient = apt && (profiles ?? []).find((p) => p.id === apt.patient_id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/read?scan=${s.id}`)}
                    className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-medical focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical"
                  >
                    <p className="text-sm font-bold text-navy">{patient?.full_name ?? "Unknown"} — {s.body_part}</p>
                    <p className="text-xs text-slate-500">
                      Signed {report!.finalized_at ? format(parseISO(report!.finalized_at), "d MMM, h:mm a") : "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">{report!.e_signature}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
