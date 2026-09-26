"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, Loader2 } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import AnnouncementsBanner from "@/frontend/components/patient/AnnouncementsBanner";
import PersonalProfileCard from "@/frontend/components/patient/PersonalProfileCard";
import { HealthProfileForm, useMyMedicalRecord } from "@/frontend/components/patient/HealthProfileForm";
import { SectionTitle } from "@/frontend/components/shared/ui";

export default function ProfilePage() {
  const { effectiveRole, currentUser } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "patient") router.replace("/dashboard");
  }, [effectiveRole, router]);

  const { record: myRecord, loadError: myRecordError, reload: reloadMyRecord } = useMyMedicalRecord(currentUser.id);

  if (effectiveRole !== "patient") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AnnouncementsBanner />

      <PersonalProfileCard />

      <section className="card p-5 sm:p-6">
        <SectionTitle
          icon={HeartPulse}
          title="Health profile & MRI safety checklist"
          subtitle="Reviewed by your technician before every scan"
        />
        {myRecordError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load your health profile: {myRecordError}
          </p>
        )}
        {myRecord === undefined ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
          </p>
        ) : (
          <HealthProfileForm existing={myRecord} onSaved={reloadMyRecord} />
        )}
      </section>
    </div>
  );
}
