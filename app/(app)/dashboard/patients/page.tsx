"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/frontend/lib/store";
import PatientRegistry from "@/frontend/components/reception/PatientRegistry";

// useSearchParams() (for the ?patient=<id> deep link from the schedule
// page's "View patient" actions) requires a Suspense boundary in the app
// router — mirrors app/(app)/dashboard/scan-logger/page.tsx's Page/Inner
// split.
export default function PatientsPage() {
  return (
    <Suspense>
      <PatientsPageInner />
    </Suspense>
  );
}

function PatientsPageInner() {
  const { effectiveRole } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "reception") router.replace("/dashboard");
  }, [effectiveRole, router]);

  const searchParams = useSearchParams();
  const patientId = searchParams.get("patient");

  if (effectiveRole !== "reception") return null;

  return (
    <div className="mx-auto max-w-7xl">
      <PatientRegistry initialPatientId={patientId} />
    </div>
  );
}
