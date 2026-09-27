"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/frontend/lib/store";
import DoctorRequestsPanel from "@/frontend/components/admin/DoctorRequestsPanel";

// Checks currentUser.role, not effectiveRole — see the same note on
// app/(app)/dashboard/staff-accounts/page.tsx.
export default function DoctorRequestsPage() {
  const { currentUser } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (currentUser.role !== "super_admin") router.replace("/dashboard");
  }, [currentUser.role, router]);

  if (currentUser.role !== "super_admin") return null;

  return (
    <div className="mx-auto max-w-7xl">
      <DoctorRequestsPanel />
    </div>
  );
}
