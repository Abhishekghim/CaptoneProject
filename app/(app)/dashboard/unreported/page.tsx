"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ClipboardList, Loader2 } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { EmptyState, SectionTitle, StatusChip } from "@/frontend/components/shared/ui";
import StaffMessagingPanel from "@/frontend/components/shared/StaffMessagingPanel";
import { useScans } from "@/frontend/lib/hooks/useScans";
import { useReports } from "@/frontend/lib/hooks/useReports";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import { useProfiles } from "@/frontend/lib/hooks/useProfiles";

// Radiologist's landing page (see app/(app)/dashboard/page.tsx's redirect).
// Picking a scan here navigates to /dashboard/read?scan=<id> instead of
// setting local selection state — the DICOM viewer + report editor now live
// on their own combined route. StaffMessagingPanel mounted here rather than
// on /dashboard/read — this is the page a radiologist actually lands on and
// returns to between reads, same reasoning as technician's queue page.
export default function UnreportedScansPage() {
  const { currentUser, effectiveRole } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "radiologist") router.replace("/dashboard");
  }, [effectiveRole, router]);

  const { data: scans, loadError: scansLoadError } = useScans();
  const { data: reports, loadError: reportsLoadError } = useReports();
  const { data: appointments, loadError: aptLoadError } = useAppointments();
  const { data: profiles, loadError: profilesLoadError } = useProfiles();

  const unreported = useMemo(
    () =>
      (scans ?? []).filter((s) => {
        const rep = (reports ?? []).find((r) => r.scan_id === s.id);
        return !rep || rep.status === "draft";
      }),
    [scans, reports]
  );

  const loadError = scansLoadError || reportsLoadError || aptLoadError || profilesLoadError;
  const loading = (!scans || !reports || !appointments || !profiles) && !loadError;

  if (effectiveRole !== "radiologist") return null;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section id="unreported-scans" className="card p-5 sm:p-6">
        <SectionTitle
          icon={ClipboardList}
          title="Unreported scans"
          subtitle={`${unreported.length} stud${unreported.length === 1 ? "y" : "ies"} awaiting a finalized report`}
        />
        {loadError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load the reading list: {loadError}
          </p>
        )}
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
          </p>
        ) : unreported.length === 0 ? (
          <EmptyState message="Reading list is clear" hint="New studies appear here as soon as technicians log them." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unreported.map((s) => {
              const apt = (appointments ?? []).find((a) => a.id === s.appointment_id);
              const patient = apt && (profiles ?? []).find((p) => p.id === apt.patient_id);
              const draft = (reports ?? []).find((r) => r.scan_id === s.id);
              const assignedRad = apt?.assigned_radiologist_id
                ? (profiles ?? []).find((p) => p.id === apt.assigned_radiologist_id)
                : null;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/read?scan=${s.id}`)}
                    className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-medical focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical"
                  >
                    <p className="text-sm font-bold text-navy">{patient?.full_name ?? "Unknown"} — {s.body_part}</p>
                    <p className="text-xs text-slate-500">
                      {s.performed_at ? format(parseISO(s.performed_at), "d MMM, h:mm a") : "time n/a"} · {s.machine_name}
                    </p>
                    {assignedRad && (
                      <p className="mt-1 text-[11px] font-semibold text-medical">
                        {assignedRad.id === currentUser.id ? "Assigned to you" : `Assigned to ${assignedRad.full_name}`}
                      </p>
                    )}
                    <div className="mt-1.5">
                      {draft ? <StatusChip status="draft" /> : <span className="chip bg-slate-100 text-slate-600">not started</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <StaffMessagingPanel />
    </div>
  );
}
