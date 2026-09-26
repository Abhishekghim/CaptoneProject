"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/frontend/lib/store";
import TodaysQueue from "@/frontend/components/technician/TodaysQueue";
import StaffMessagingPanel from "@/frontend/components/shared/StaffMessagingPanel";

// Technician's landing page (see app/(app)/dashboard/page.tsx's redirect).
// StaffMessagingPanel mounted here rather than on /dashboard/scan-logger —
// this is the page a technician actually lands on and returns to between
// scans, same reasoning as why it used to sit at the bottom of the old
// single-scroll TechnicianPortal.
export default function QueuePage() {
  const { effectiveRole } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "technician") router.replace("/dashboard");
  }, [effectiveRole, router]);

  if (effectiveRole !== "technician") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <TodaysQueue />
      <StaffMessagingPanel />
    </div>
  );
}
