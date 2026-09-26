"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/frontend/lib/store";

// Every role's dashboard now lives at a real route under /dashboard/* (see
// Shell.tsx's NAV_BY_ROLE and frontend/components/patient/*, admin/*,
// technician/*, radiologist/*, referring-doctor/*, reception/*) instead of
// rendering inline here — this page is just the redirect to each role's
// default landing page.
export default function Home() {
  const { effectiveRole } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole === "patient") router.replace("/dashboard/book");
    if (effectiveRole === "admin") router.replace("/dashboard/overview");
    if (effectiveRole === "super_admin") router.replace("/dashboard/staff-accounts");
    if (effectiveRole === "technician") router.replace("/dashboard/queue");
    if (effectiveRole === "radiologist") router.replace("/dashboard/unreported");
    if (effectiveRole === "referring_doctor") router.replace("/dashboard/refer");
    if (effectiveRole === "reception") router.replace("/dashboard/schedule");
  }, [effectiveRole, router]);

  return null;
}
