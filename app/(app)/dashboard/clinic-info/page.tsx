"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import AnnouncementsBanner from "@/frontend/components/patient/AnnouncementsBanner";
import ClinicInfoTabs from "@/frontend/components/patient/ClinicInfoTabs";
import { SectionTitle } from "@/frontend/components/shared/ui";

export default function ClinicInfoPage() {
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
        <SectionTitle icon={Info} title="Clinic info & MRI preparation" subtitle="About us, contact details, FAQs, and how to prepare for your scan" />
        <ClinicInfoTabs />
      </section>
    </div>
  );
}
