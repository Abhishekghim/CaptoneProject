"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/frontend/lib/store";
import NewReferralPanel from "@/frontend/components/referring-doctor/NewReferralPanel";

// Referring doctor's landing page (see app/(app)/dashboard/page.tsx's
// redirect). Success feedback links to /dashboard/referrals-sent rather
// than navigating there automatically, so the doctor can refer several
// patients in a row without losing the form.
export default function ReferPage() {
  const { effectiveRole } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "referring_doctor") router.replace("/dashboard");
  }, [effectiveRole, router]);

  if (effectiveRole !== "referring_doctor") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <NewReferralPanel />
    </div>
  );
}
