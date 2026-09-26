"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import AnnouncementsBanner from "@/frontend/components/patient/AnnouncementsBanner";
import NotificationPreferencesForm from "@/frontend/components/patient/NotificationPreferencesForm";
import { SectionTitle } from "@/frontend/components/shared/ui";

export default function SettingsPage() {
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
        <SectionTitle
          icon={Bell}
          title="Notification preferences"
          subtitle="Choose what you're alerted about, and how"
        />
        <NotificationPreferencesForm />
      </section>
    </div>
  );
}
