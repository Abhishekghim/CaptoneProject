"use client";

import React from "react";
import { format } from "date-fns";
import { BadgeDollarSign, CalendarClock, FileClock, LayoutDashboard, ScanLine } from "lucide-react";
import StaffMessagingPanel from "@/frontend/components/shared/StaffMessagingPanel";
import { SectionTitle, StatCard } from "@/frontend/components/shared/ui";
import AppointmentsPanel from "./AppointmentsPanel";
import BillingPanel from "./BillingPanel";
import EquipmentPanel from "./EquipmentPanel";
import InventoryPanel from "./InventoryPanel";
import ReportsPanel from "./ReportsPanel";
import ContentManagementPanel from "./ContentManagementPanel";
import SecurityAlertsPanel from "./SecurityAlertsPanel";
import AccountDeletionRequestsPanel from "./AccountDeletionRequestsPanel";
import AuditPanel from "./AuditPanel";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import { useBilling } from "@/frontend/lib/hooks/useBilling";
import { useScans } from "@/frontend/lib/hooks/useScans";
import { useReports } from "@/frontend/lib/hooks/useReports";

// AppointmentsPanel, BillingPanel, EquipmentPanel, and AuditPanel used to be
// defined inline here — they're now their own files under
// frontend/components/admin/ (each mounted directly by its own route under
// app/(app)/dashboard/*), and this file just re-composes them so it keeps
// working exactly as before for SuperAdminDashboard.tsx, which still renders
// <AdminDashboard/> wholesale underneath its 2 super_admin-only panels.
export default function AdminDashboard() {
  const now = new Date();
  const monthKey = format(now, "yyyy-MM");

  // KPI strip — each hook is its own independent fetch (house convention:
  // no shared cross-component cache), so these run alongside the same
  // hooks called again inside the panels below.
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

      <AppointmentsPanel />
      <BillingPanel />
      <EquipmentPanel />
      <InventoryPanel />
      <ReportsPanel />
      <ContentManagementPanel />
      <SecurityAlertsPanel />
      <AccountDeletionRequestsPanel />
      <StaffMessagingPanel />
      <AuditPanel />
    </div>
  );
}
