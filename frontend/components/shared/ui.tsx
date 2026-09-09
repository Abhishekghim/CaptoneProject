"use client";

import React from "react";
import type { AppointmentStatus, DoctorRequestStatus, EquipmentStatus, PaymentStatus, ReportStatus } from "@/shared/types";
import { LucideIcon } from "lucide-react";

const statusStyles: Record<string, string> = {
  scheduled: "bg-sky-100 text-sky-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-600",
  draft: "bg-amber-100 text-amber-800",
  finalized: "bg-emerald-100 text-emerald-800",
  pending: "bg-slate-200 text-slate-700",
  paid: "bg-emerald-100 text-emerald-800",
  insurance_review: "bg-violet-100 text-violet-800",
  refunded: "bg-slate-200 text-slate-600",
  failed: "bg-rose-100 text-rose-800",
  operational: "bg-emerald-100 text-emerald-800",
  maintenance: "bg-amber-100 text-amber-800",
  offline: "bg-rose-100 text-rose-800",
  calibration_due: "bg-rose-100 text-rose-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

export function StatusChip({
  status,
}: {
  status: AppointmentStatus | ReportStatus | PaymentStatus | EquipmentStatus | DoctorRequestStatus;
}) {
  return (
    <span className={`chip ${statusStyles[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card flex items-start gap-4 p-5">
      <div className="rounded-lg bg-medical-light p-2.5 text-medical">
        <Icon size={22} strokeWidth={2} aria-hidden />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-navy">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

export function SectionTitle({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <Icon size={20} className="text-medical" aria-hidden />
        <div>
          <h2 className="text-lg font-bold text-navy">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="text-sm font-semibold text-slate-600">{message}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
