"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, LayoutDashboard, Loader2, ScanLine, Users } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { SectionTitle, StatCard } from "@/frontend/components/shared/ui";
import StaffMessagingPanel from "@/frontend/components/shared/StaffMessagingPanel";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import { useProfiles } from "@/frontend/lib/hooks/useProfiles";
import { useBilling } from "@/frontend/lib/hooks/useBilling";
import { AttentionRequiredSection, TodaysScheduleTable, WaitingRoomSection, getAttentionReasons } from "@/frontend/components/reception/TodaysSchedule";

// Reception's landing page (see app/(app)/dashboard/page.tsx's redirect).
// TodaysScheduleTable, WaitingRoomSection, and AttentionRequiredSection stay
// on one page (rather than splitting further) because they all read the same
// lifted appointments/profiles/billing state below — checking a patient in
// here immediately moves them into the Waiting Room section in the same
// render. "View patient" navigates to /dashboard/patients?patient=<id>
// instead of local tab-switching, now that patients live on their own route.
export default function SchedulePage() {
  const { effectiveRole } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "reception") router.replace("/dashboard");
  }, [effectiveRole, router]);

  const { data: appointments, loadError: aptLoadError, reload: reloadAppointments } = useAppointments();
  const { data: profiles, loadError: profilesLoadError } = useProfiles();
  const { data: billing, loadError: billingLoadError } = useBilling();

  function viewPatient(patientId: string) {
    router.push(`/dashboard/patients?patient=${patientId}`);
  }

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const today = useMemo(
    () => (appointments ?? []).filter((a) => a.date === todayStr).sort((a, b) => a.time_slot.localeCompare(b.time_slot)),
    [appointments, todayStr]
  );
  const activeToday = today.filter((a) => a.status !== "cancelled");

  const checkedInCount = activeToday.filter((a) => a.arrival_status !== "not_arrived" && a.arrival_status !== "no_show").length;
  const waitingCount = activeToday.filter((a) => a.arrival_status === "waiting").length;
  const inProgressCount = activeToday.filter((a) => a.status === "in_progress").length;
  const completedCount = activeToday.filter((a) => a.status === "completed").length;
  const attentionCount = activeToday.filter((a) => getAttentionReasons(a, (billing ?? []).find((b) => b.appointment_id === a.id)).length > 0).length;

  const loadError = aptLoadError || profilesLoadError || billingLoadError;
  const loading = (!appointments || !profiles || !billing) && !loadError;

  if (effectiveRole !== "reception") return null;

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <section id="today-s-schedule">
        <SectionTitle
          icon={LayoutDashboard}
          title={`Reception — ${format(new Date(), "EEEE d MMM yyyy")}`}
          subtitle="Front-desk overview for today"
        />
        {loadError && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load today&apos;s data: {loadError}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard icon={CalendarClock} label="Today's appointments" value={String(activeToday.length)} />
          <StatCard icon={CheckCircle2} label="Checked in" value={String(checkedInCount)} />
          <StatCard icon={Clock} label="Waiting" value={String(waitingCount)} />
          <StatCard icon={ScanLine} label="In progress" value={String(inProgressCount)} />
          <StatCard icon={Users} label="Completed" value={String(completedCount)} />
          <StatCard icon={AlertTriangle} label="Needs attention" value={String(attentionCount)} />
        </div>
      </section>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : (
        <>
          <TodaysScheduleTable
            appointments={today}
            profiles={profiles ?? []}
            billing={billing ?? []}
            onViewPatient={viewPatient}
            onChanged={reloadAppointments}
          />
          <WaitingRoomSection appointments={activeToday} profiles={profiles ?? []} />
          <AttentionRequiredSection appointments={activeToday} billing={billing ?? []} profiles={profiles ?? []} onViewPatient={viewPatient} />
          <StaffMessagingPanel />
        </>
      )}
    </div>
  );
}
