"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import AnnouncementsBanner from "@/frontend/components/patient/AnnouncementsBanner";
import BookingCard from "@/frontend/components/patient/BookingCard";
import { useMyMedicalRecord } from "@/frontend/components/patient/HealthProfileForm";

// Gate #1: a patient can't book until their health profile exists (dob is
// captured on that first save — see HealthProfileForm.tsx / schema.sql's
// `dob date not null` on patient_medical_records, so an existing row always
// has it set).
export default function BookPage() {
  const { effectiveRole, currentUser } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "patient") router.replace("/dashboard");
  }, [effectiveRole, router]);

  const { record, loadError: myRecordError } = useMyMedicalRecord(currentUser.id);

  if (effectiveRole !== "patient") return null;

  const profileComplete = record !== undefined && record !== null && Boolean(record.dob);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AnnouncementsBanner />

      {myRecordError && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Could not check your health profile: {myRecordError}
        </p>
      )}

      {record === undefined ? null : profileComplete ? (
        <BookingCard onBooked={() => {}} />
      ) : (
        <div className="card flex flex-col items-start gap-3 p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <ClipboardList size={20} className="text-medical" aria-hidden />
            <h2 className="text-lg font-bold text-navy">Complete your health profile first</h2>
          </div>
          <p className="text-sm text-slate-600">
            Complete your health profile before booking an MRI — we need this information for your safety during
            the scan.
          </p>
          <Link href="/dashboard/profile" className="btn-primary text-sm">
            Go to health profile
          </Link>
        </div>
      )}
    </div>
  );
}
