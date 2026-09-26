"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import AnnouncementsBanner from "@/frontend/components/patient/AnnouncementsBanner";
import AccountPrivacyPanel from "@/frontend/components/patient/AccountPrivacyPanel";
import { SectionTitle } from "@/frontend/components/shared/ui";

export default function PrivacyPage() {
  const { effectiveRole } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "patient") router.replace("/dashboard");
  }, [effectiveRole, router]);

  if (effectiveRole !== "patient") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AnnouncementsBanner />

      <section className="card p-5 sm:p-6">
        <SectionTitle icon={ShieldCheck} title="Privacy & your data" subtitle="Your consent status and data-removal options" />
        <AccountPrivacyPanel />
      </section>
    </div>
  );
}
