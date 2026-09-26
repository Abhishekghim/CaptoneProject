"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/frontend/lib/store";
import DoctorRequestsPanel from "@/frontend/components/admin/DoctorRequestsPanel";

export default function DoctorRequestsPage() {
  const { effectiveRole } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "super_admin") router.replace("/dashboard");
  }, [effectiveRole, router]);

  if (effectiveRole !== "super_admin") return null;

  return (
    <div className="mx-auto max-w-7xl">
      <DoctorRequestsPanel />
    </div>
  );
}
