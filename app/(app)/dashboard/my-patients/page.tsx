"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { FileSignature, Paperclip, Users } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { EmptyState, SectionTitle, StatusChip } from "@/frontend/components/shared/ui";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import { useProfiles } from "@/frontend/lib/hooks/useProfiles";
import { useReports } from "@/frontend/lib/hooks/useReports";
import { useIsInternalReferringDoctor, useScansByAppointment } from "@/frontend/components/referring-doctor/hooks";
import ReferralUpload from "@/frontend/components/referring-doctor/ReferralUpload";
import ScanImageToggle from "@/frontend/components/referring-doctor/ScanImageToggle";

// "My referred patients" (see app/(app)/dashboard/page.tsx's redirect and
// Shell.tsx's referring_doctor nav).
export default function MyPatientsPage() {
  const store = useStore();
  const me = store.currentUser;
  const { effectiveRole } = store;
  const router = useRouter();
  const isInternal = useIsInternalReferringDoctor(me.id);

  useEffect(() => {
    if (effectiveRole !== "referring_doctor") router.replace("/dashboard");
  }, [effectiveRole, router]);

  // appts_referring_doctor_read RLS already scopes this to exactly the rows
  // where referring_doctor_id = auth.uid(), so useAppointments() (select *)
  // naturally returns only this doctor's own referred appointments — no
  // client-side filter needed to enforce that, though it's kept below for
  // clarity/defense-in-depth and to stay resilient if that policy ever
  // widens.
  const { data: appointmentsData, loadError: aptLoadError, reload: reloadAppointments } = useAppointments();
  const { data: profiles, loadError: profilesLoadError } = useProfiles();
  const { data: reportsData, loadError: reportsLoadError } = useReports();

  const myReferrals = (appointmentsData ?? [])
    .filter((a) => a.referring_doctor_id === me.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const myReferralIds = useMemo(() => myReferrals.map((a) => a.id), [myReferrals]);
  const { scansByAppointment, loadError: scansLoadError } = useScansByAppointment(myReferralIds);

  if (effectiveRole !== "referring_doctor") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <section id="my-referrals" className="card p-5 sm:p-6">
        <SectionTitle
          icon={Users}
          title="My referred patients"
          subtitle="Appointments where you're listed as the referring doctor"
        />
        {(scansLoadError || aptLoadError || profilesLoadError || reportsLoadError) && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load referral data: {scansLoadError || aptLoadError || profilesLoadError || reportsLoadError}
          </p>
        )}
        {myReferrals.length === 0 ? (
          <EmptyState
            message="No referred appointments yet"
            hint="When a patient selects you as their referring doctor at booking, it appears here."
          />
        ) : (
          <ul className="space-y-4">
            {myReferrals.map((a) => {
              const patient = (profiles ?? []).find((p) => p.id === a.patient_id);
              const scan = scansByAppointment ? scansByAppointment[a.id] : undefined;
              const report = scan ? (reportsData ?? []).find((r) => r.scan_id === scan.id) : undefined;
              const finalized = report?.status === "finalized";
              return (
                <li key={a.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-navy">
                        {patient?.full_name ?? "Unknown patient"} — {a.body_part}
                      </p>
                      <p className="text-xs text-slate-500">
                        {format(parseISO(a.date), "d MMM yyyy")} {a.time_slot} · {a.location}
                      </p>
                      {a.referral_url && (
                        <p className="mt-1 text-xs text-emerald-700">
                          <Paperclip size={12} className="inline" aria-hidden /> {a.referral_url.split("/").pop()}
                        </p>
                      )}
                    </div>
                    <StatusChip status={a.status} />
                  </div>

                  <ReferralUpload appointmentId={a.id} onUploaded={reloadAppointments} />

                  {finalized && report && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <FileSignature size={13} aria-hidden /> Finalized report
                      </p>
                      <p className="text-slate-700">
                        <span className="font-semibold text-navy">Findings:</span> {report.findings}
                      </p>
                      <p className="mt-1 text-slate-700">
                        <span className="font-semibold text-navy">Impression:</span> {report.impression}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Signed: {report.e_signature}</p>
                      {isInternal && scan && <ScanImageToggle scan={scan} />}
                      {isInternal === false && (
                        <p className="mt-2 text-xs text-slate-400">
                          Scan images aren&rsquo;t released to external referring doctors — your patient can share it with you directly if they choose to.
                        </p>
                      )}
                    </div>
                  )}
                  {!finalized && (
                    <p className="mt-2 text-xs text-slate-400">Report not yet finalized — it will appear here once signed.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
