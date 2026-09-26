"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ScanLine } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";
import { useTodaysQueue } from "@/frontend/components/technician/TodaysQueue";
import ScanLoggerForm from "@/frontend/components/technician/ScanLoggerForm";

// useSearchParams() (for the ?appointment=<id> deep link from the queue's
// "Log completed scan" button) requires a Suspense boundary in the app
// router — mirrors app/(app)/dashboard/billing/page.tsx's Page/Inner split.
export default function ScanLoggerPage() {
  return (
    <Suspense>
      <ScanLoggerPageInner />
    </Suspense>
  );
}

function ScanLoggerPageInner() {
  const { effectiveRole } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "technician") router.replace("/dashboard");
  }, [effectiveRole, router]);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { queue, loadError } = useTodaysQueue(todayStr);
  const todaysQueue = queue ?? [];
  const inProgress = todaysQueue.filter((a) => a.status === "in_progress");

  const searchParams = useSearchParams();
  const appointmentId = searchParams.get("appointment");

  if (effectiveRole !== "technician") return null;

  const appointment = (appointmentId ? todaysQueue.find((a) => a.id === appointmentId) : undefined) ?? inProgress[0];

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <section id="scan-logger" className="card p-5 sm:p-6">
        <SectionTitle
          icon={ScanLine}
          title="Scan logger"
          subtitle="Record the procedure and upload the DICOM series — this releases the study to radiology"
        />
        {loadError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load today&apos;s queue: {loadError}
          </p>
        )}
        {inProgress.length === 0 ? (
          <EmptyState
            message="No scan is in progress"
            hint='Press "Start scan" on a queued appointment to open the logger.'
          />
        ) : (
          <ScanLoggerForm
            appointment={appointment}
            onLogged={() => router.push("/dashboard/queue")}
          />
        )}
      </section>
    </div>
  );
}
