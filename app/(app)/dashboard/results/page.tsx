"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileSignature } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import AnnouncementsBanner from "@/frontend/components/patient/AnnouncementsBanner";
import { FinalizedReportRow, useMyFinalReports } from "@/frontend/components/patient/FinalizedReportRow";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";

export default function ResultsPage() {
  const { effectiveRole, currentUser } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "patient") router.replace("/dashboard");
  }, [effectiveRole, router]);

  const { reports: myFinalReportsData, loadError: myFinalReportsError } = useMyFinalReports(currentUser.id);
  const myFinalReports = myFinalReportsData ?? [];

  if (effectiveRole !== "patient") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AnnouncementsBanner />

      <div className="card p-5 sm:p-6">
        <SectionTitle
          icon={FileSignature}
          title="Results & reports"
          subtitle="Finalized reports appear here once your radiologist signs off"
        />
        {myFinalReportsError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load your reports: {myFinalReportsError}
          </p>
        )}
        {myFinalReportsData === null && !myFinalReportsError ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
          </p>
        ) : myFinalReports.length === 0 ? (
          <EmptyState
            message="No finalized reports yet"
            hint="You'll get a notification (bell icon, top right) the moment a report is ready."
          />
        ) : (
          <ul className="space-y-4">
            {myFinalReports.map(({ report, scan, apt }) => (
              <FinalizedReportRow key={report.id} report={report} scan={scan} apt={apt} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
