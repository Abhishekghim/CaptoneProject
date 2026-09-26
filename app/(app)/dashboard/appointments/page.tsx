"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAfter, parseISO, startOfToday } from "date-fns";
import { ClipboardList } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import AnnouncementsBanner from "@/frontend/components/patient/AnnouncementsBanner";
import AppointmentHistoryRow from "@/frontend/components/patient/AppointmentHistoryRow";
import { SectionTitle } from "@/frontend/components/shared/ui";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import AppointmentsPanel from "@/frontend/components/admin/AppointmentsPanel";

// Shared route: /dashboard/appointments is patient's appointment history AND
// admin/super_admin's "All appointments" ops panel — Next.js routes don't
// know about "role", so this branches on effectiveRole instead of being two
// separate pages. Patient's branch below is unchanged from before this split.
export default function AppointmentsPage() {
  const { effectiveRole, currentUser } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "patient" && effectiveRole !== "admin" && effectiveRole !== "super_admin") {
      router.replace("/dashboard");
    }
  }, [effectiveRole, router]);

  // appts_patient_read_own RLS (schema.sql) already scopes this to exactly
  // `patient_id = auth.uid()` for a patient caller, so the broad,
  // staff-shaped useAppointments() naturally returns just this patient's
  // own rows here — no separate patient-scoped hook needed (see the note on
  // useAppointments() in frontend/lib/hooks/useAppointments.ts). The
  // client-side filter below is kept for clarity/defense-in-depth.
  const { data: appointmentsData, loadError: aptLoadError, reload: reloadAppointments } = useAppointments();
  const myAppointments = (appointmentsData ?? [])
    .filter((a) => a.patient_id === currentUser.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  if (effectiveRole === "admin" || effectiveRole === "super_admin") {
    return (
      <div className="mx-auto max-w-7xl">
        <AppointmentsPanel />
      </div>
    );
  }

  if (effectiveRole !== "patient") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AnnouncementsBanner />

      <section className="card p-5 sm:p-6">
        <SectionTitle icon={ClipboardList} title="Appointment history" subtitle="Upcoming and past visits" />
        {aptLoadError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load your appointments: {aptLoadError}
          </p>
        )}
        <ul className="divide-y divide-slate-100">
          {myAppointments.map((a) => {
            const upcoming = a.status === "scheduled" && !isAfter(startOfToday(), parseISO(a.date));
            return <AppointmentHistoryRow key={a.id} appointment={a} upcoming={upcoming} onChanged={reloadAppointments} />;
          })}
        </ul>
      </section>
    </div>
  );
}
