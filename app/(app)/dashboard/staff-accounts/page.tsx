"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/frontend/lib/store";
import StaffDirectoryPanel from "@/frontend/components/super-admin/StaffDirectoryPanel";

// Checks currentUser.role, not effectiveRole — this page is genuinely
// super_admin-exclusive, not "previewable" like the rest of the app. Using
// effectiveRole here would let an admin see real staff-account data by
// previewing as super_admin (reads pass is_staff()/is_admin() RLS even
// though the actual writes would still correctly fail on the real role).
export default function StaffAccountsPage() {
  const { currentUser } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (currentUser.role !== "super_admin") router.replace("/dashboard");
  }, [currentUser.role, router]);

  if (currentUser.role !== "super_admin") return null;

  return (
    <div className="mx-auto max-w-7xl">
      <StaffDirectoryPanel />
    </div>
  );
}
