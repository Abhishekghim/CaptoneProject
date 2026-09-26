"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { BadgeDollarSign, CalendarClock, FileClock, LayoutDashboard, ScanLine } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { SectionTitle, StatCard } from "@/frontend/components/shared/ui";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import { useBilling } from "@/frontend/lib/hooks/useBilling";
import { useScans } from "@/frontend/lib/hooks/useScans";
import { useReports } from "@/frontend/lib/hooks/useReports";

// Admin's first route (Operations overview) — extracted from
// AdminDashboard.tsx's inline stat-card section (lines 63-73), which stays
// reachable for super_admin via SuperAdminDashboard.tsx's wholesale render
// of <AdminDashboard/>.
export default function OverviewPage() {
  const { effectiveRole } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "admin" && effectiveRole !== "super_admin") router.replace("/dashboard");
  }, [effectiveRole, router]);

  const now = new Date();
  const monthKey = format(now, "yyyy-MM");

  const { data: appointments } = useAppointments();
  const { data: billing } = useBilling();
  const { data: scans } = useScans();
  const { data: reports } = useReports();

  const totalScans = scans?.length ?? 0;
  const monthlyRevenue = (billing ?? [])
    .filter((b) => b.payment_status === "paid" && b.paid_at?.startsWith(monthKey))
    .reduce((sum, b) => sum + b.amount, 0);
  const pendingReports = (scans ?? []).filter((s) => {
    const rep = (reports ?? []).find((r) => r.scan_id === s.id);
    return !rep || rep.status === "draft";
  }).length;
  const todaysAppointments = (appointments ?? []).filter(
    (a) => a.date === format(now, "yyyy-MM-dd") && a.status !== "cancelled"
  ).length;

  if (effectiveRole !== "admin" && effectiveRole !== "super_admin") return null;

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <section id="overview">
        <SectionTitle icon={LayoutDashboard} title="Operations overview" subtitle="Live key performance indicators" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={ScanLine} label="Total scans performed" value={String(totalScans)} sub="All time, all sites" />
          <StatCard icon={BadgeDollarSign} label="Revenue this month" value={`$${monthlyRevenue.toFixed(2)}`} sub={format(now, "MMMM yyyy")} />
          <StatCard icon={FileClock} label="Pending reports" value={String(pendingReports)} sub="Awaiting radiologist sign-off" />
          <StatCard icon={CalendarClock} label="Appointments today" value={String(todaysAppointments)} sub="Scheduled + in progress" />
        </div>
      </section>
    </div>
  );
}
