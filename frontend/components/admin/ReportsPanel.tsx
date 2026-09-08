"use client";

import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { BarChart3, Download, FileDown } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { downloadCsv } from "@/frontend/lib/csv";
import { generateReceiptPdf } from "@/frontend/lib/receiptPdf";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";

type Period = "daily" | "weekly" | "monthly";

function periodKey(dateIso: string, period: Period): string {
  const d = parseISO(dateIso);
  if (period === "daily") return format(d, "yyyy-MM-dd");
  if (period === "monthly") return format(d, "yyyy-MM");
  // weekly: ISO week label
  return format(d, "RRRR-'W'II");
}

function downloadReportPdf(title: string, rows: (string | number)[][]) {
  const blob = generateReceiptPdf([title, "", ...rows.map((r) => r.join("  |  "))]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.toLowerCase().replace(/\s+/g, "-")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportButtons({ title, rows }: { title: string; rows: (string | number)[][] }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="btn-ghost px-2.5 py-1 text-xs"
        onClick={() => downloadCsv(`${title.toLowerCase().replace(/\s+/g, "-")}.csv`, rows)}
      >
        <Download size={13} aria-hidden /> CSV
      </button>
      <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => downloadReportPdf(title, rows)}>
        <FileDown size={13} aria-hidden /> PDF
      </button>
    </div>
  );
}

export default function ReportsPanel() {
  const store = useStore();
  const [period, setPeriod] = useState<Period>("weekly");

  const scanVolume = useMemo(() => {
    const byPeriod = new Map<string, number>();
    store.scans.forEach((s) => {
      if (!s.performed_at) return;
      const key = periodKey(s.performed_at, period);
      byPeriod.set(key, (byPeriod.get(key) ?? 0) + 1);
    });
    return Array.from(byPeriod.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [store.scans, period]);

  const financialSummary = useMemo(() => {
    const byPeriod = new Map<string, number>();
    store.billing
      .filter((b) => b.payment_status === "paid" && b.paid_at)
      .forEach((b) => {
        const key = periodKey(b.paid_at as string, period);
        byPeriod.set(key, (byPeriod.get(key) ?? 0) + b.amount);
      });
    return Array.from(byPeriod.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [store.billing, period]);

  const staffUtilisation = useMemo(() => {
    const scanCounts = new Map<string, number>();
    store.scans.forEach((s) => {
      if (!s.technician_id) return;
      scanCounts.set(s.technician_id, (scanCounts.get(s.technician_id) ?? 0) + 1);
    });
    const reportCounts = new Map<string, number>();
    store.reports
      .filter((r) => r.status === "finalized")
      .forEach((r) => reportCounts.set(r.radiologist_id, (reportCounts.get(r.radiologist_id) ?? 0) + 1));

    return store.profiles
      .filter((p) => p.role === "technician" || p.role === "radiologist")
      .map((p) => ({
        name: p.full_name,
        role: p.role,
        workload: p.role === "technician" ? scanCounts.get(p.id) ?? 0 : reportCounts.get(p.id) ?? 0,
      }));
  }, [store.profiles, store.scans, store.reports]);

  const equipmentUsage = useMemo(
    () =>
      store.equipment.map((e) => ({
        name: e.machine_name,
        status: e.status,
        usage_hours: e.usage_hours,
        service_events: store.equipmentServiceLog.filter((l) => l.equipment_id === e.id).length,
      })),
    [store.equipment, store.equipmentServiceLog]
  );

  return (
    <section id="reports-analytics" className="card space-y-6 p-5 sm:p-6">
      <SectionTitle
        icon={BarChart3}
        title="Reporting & analytics"
        subtitle="Period-based operational reports, exportable as CSV or PDF (FR67–FR69)"
        action={
          <select className="input w-36" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-navy">Scan volume</p>
            <ExportButtons title="Scan volume report" rows={[["Period", "Scans"], ...scanVolume]} />
          </div>
          {scanVolume.length === 0 ? <EmptyState message="No scans recorded" /> : (
            <table className="w-full text-left text-sm">
              <tbody>
                {scanVolume.map(([key, count]) => (
                  <tr key={key} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 pr-4 font-mono text-xs text-slate-500">{key}</td>
                    <td className="py-1.5 font-semibold text-navy">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-navy">Financial summary</p>
            <ExportButtons title="Financial summary" rows={[["Period", "Revenue"], ...financialSummary.map(([k, v]) => [k, v.toFixed(2)])]} />
          </div>
          {financialSummary.length === 0 ? <EmptyState message="No paid bills yet" /> : (
            <table className="w-full text-left text-sm">
              <tbody>
                {financialSummary.map(([key, amount]) => (
                  <tr key={key} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 pr-4 font-mono text-xs text-slate-500">{key}</td>
                    <td className="py-1.5 font-semibold text-navy">${amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-navy">Staff utilisation</p>
            <ExportButtons title="Staff utilisation report" rows={[["Name", "Role", "Workload"], ...staffUtilisation.map((s) => [s.name, s.role, s.workload])]} />
          </div>
          <table className="w-full text-left text-sm">
            <tbody>
              {staffUtilisation.map((s) => (
                <tr key={s.name} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-4 font-semibold text-navy">{s.name}</td>
                  <td className="py-1.5 pr-4 capitalize text-slate-500">{s.role}</td>
                  <td className="py-1.5 font-semibold text-navy">{s.workload}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-navy">Equipment usage</p>
            <ExportButtons title="Equipment usage report" rows={[["Machine", "Status", "Usage hours", "Service events"], ...equipmentUsage.map((e) => [e.name, e.status, e.usage_hours, e.service_events])]} />
          </div>
          <table className="w-full text-left text-sm">
            <tbody>
              {equipmentUsage.map((e) => (
                <tr key={e.name} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-4 font-semibold text-navy">{e.name}</td>
                  <td className="py-1.5 pr-4 capitalize text-slate-500">{e.status.replace(/_/g, " ")}</td>
                  <td className="py-1.5 pr-4">{e.usage_hours.toLocaleString()} h</td>
                  <td className="py-1.5">{e.service_events}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
