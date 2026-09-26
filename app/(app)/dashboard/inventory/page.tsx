"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/frontend/lib/store";
import InventoryPanel from "@/frontend/components/admin/InventoryPanel";

export default function InventoryPage() {
  const { effectiveRole } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "admin" && effectiveRole !== "super_admin") router.replace("/dashboard");
  }, [effectiveRole, router]);

  if (effectiveRole !== "admin" && effectiveRole !== "super_admin") return null;

  return (
    <div className="mx-auto max-w-7xl">
      <InventoryPanel />
    </div>
  );
}
