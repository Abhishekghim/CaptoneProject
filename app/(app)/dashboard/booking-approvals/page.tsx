"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/frontend/lib/store";
import BookingReviewQueue from "@/frontend/components/reception/BookingReviewQueue";
import { useIsInternalReferringDoctor } from "@/frontend/components/referring-doctor/hooks";
import { EmptyState } from "@/frontend/components/shared/ui";

// Internal referring doctors approve their own patients' bookings.
// review_booking enforces this; the page only decides what to show.
export default function BookingApprovalsPage() {
  return (
    <Suspense>
      <BookingApprovalsInner />
    </Suspense>
  );
}

function BookingApprovalsInner() {
  const { effectiveRole, currentUser } = useStore();
  const router = useRouter();
  const isInternal = useIsInternalReferringDoctor(currentUser.id);
  const focusId = useSearchParams().get("appointment");

  useEffect(() => {
    if (effectiveRole !== "referring_doctor") router.replace("/dashboard");
  }, [effectiveRole, router]);

  if (effectiveRole !== "referring_doctor" || isInternal === null) return null;

  return (
    <div className="mx-auto max-w-5xl">
      {isInternal ? (
        <BookingReviewQueue focusId={focusId} doctorId={currentUser.id} />
      ) : (
        <section className="card p-5 sm:p-6">
          <EmptyState
            message="Bookings from your referrals are checked automatically"
            hint="When your patient books within 24 hours with matching details, their appointment confirms straight away. Otherwise the clinic reviews it."
          />
        </section>
      )}
    </div>
  );
}
