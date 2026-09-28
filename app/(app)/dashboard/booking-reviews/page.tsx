"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/frontend/lib/store";
import BookingReviewQueue from "@/frontend/components/reception/BookingReviewQueue";
import type { Role } from "@/shared/types";

// Hiding the page is only for navigation; review_booking and RLS enforce
// who can actually approve or decline.
const REVIEWER_ROLES: Role[] = ["reception", "admin", "super_admin"];

export default function BookingReviewsPage() {
  return (
    <Suspense>
      <BookingReviewsInner />
    </Suspense>
  );
}

function BookingReviewsInner() {
  const { effectiveRole } = useStore();
  const router = useRouter();
  const allowed = REVIEWER_ROLES.includes(effectiveRole);

  useEffect(() => {
    if (!allowed) router.replace("/dashboard");
  }, [allowed, router]);

  const focusId = useSearchParams().get("appointment");

  if (!allowed) return null;

  return (
    <div className="mx-auto max-w-5xl">
      <BookingReviewQueue focusId={focusId} />
    </div>
  );
}
