"use client";

import React, { useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Loader2, PlusCircle, Wrench } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";
import { SectionTitle, StatusChip } from "@/frontend/components/shared/ui";
import { useEquipment } from "@/frontend/lib/hooks/useEquipment";
import { useEquipmentServiceLog } from "@/frontend/lib/hooks/useEquipmentServiceLog";
import type { EquipmentLog } from "@/shared/types";

// Relocated from AdminDashboard.tsx (was inline lines 595-803, plus
// RegisterEquipmentForm and EquipmentServiceLog which stay co-located here
// since they're only used by this panel) as part of the admin route split —
// logic unchanged.
export default function EquipmentPanel() {
  const [showRegister, setShowRegister] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const { data: equipment, loadError, reload } = useEquipment();

  const [serviceBusyId, setServiceBusyId] = useState<string | null>(null);
  const [serviceErrors, setServiceErrors] = useState<Record<string, string>>({});

  async function scheduleService(equipmentId: string) {
    setServiceBusyId(equipmentId);
    setServiceErrors((e) => ({ ...e, [equipmentId]: "" }));
    const supabase = createClient();
    const { error } = await supabase.rpc("schedule_equipment_service", { p_equipment_id: equipmentId });
    setServiceBusyId(null);
    if (error) {
      setServiceErrors((e) => ({ ...e, [equipmentId]: error.message }));
      return;
    }
    reload();
    setLogRefreshKey((k) => k + 1);
  }

  return (
    <section id="equipment" className="card p-5 sm:p-6">
      <SectionTitle
        icon={Wrench}
        title="Equipment maintenance & calibration"
        subtitle="Machines past due are flagged and excluded from the technician's scanner list"
        action={
          <div className="flex gap-2">
            <button type="button" className="btn-ghost text-xs" onClick={() => setShowLog((v) => !v)}>
              {showLog ? "Hide service log" : "Service log"}
            </button>
            <button type="button" className="btn-primary text-xs" onClick={() => setShowRegister((v) => !v)}>
              <PlusCircle size={14} aria-hidden /> Register equipment
            </button>
          </div>
        }
      />
      {showRegister && (
        <RegisterEquipmentForm
          onDone={() => {
            setShowRegister(false);
            reload();
            setLogRefreshKey((k) => k + 1);
          }}
        />
      )}
      {showLog && <EquipmentServiceLog key={logRefreshKey} equipment={equipment ?? []} />}
      {loadError && (
        <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Could not load equipment: {loadError}
        </p>
      )}
      {!equipment && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(equipment ?? []).map((eq) => {
            const daysToDue = eq.maintenance_due ? differenceInCalendarDays(parseISO(eq.maintenance_due), new Date()) : 0;
            const urgent = daysToDue <= 3;
            const busy = serviceBusyId === eq.id;
            return (
              <article key={eq.id} className={`rounded-lg border p-4 ${urgent ? "border-rose-300 bg-rose-50/50" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-navy">{eq.machine_name}</h3>
                    <p className="text-xs text-slate-500">{eq.model}</p>
                  </div>
                  <StatusChip status={eq.status} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-slate-500">Last calibration</dt>
                    <dd className="font-semibold text-navy">
                      {eq.last_calibration ? format(parseISO(eq.last_calibration), "d MMM yyyy") : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Maintenance due</dt>
                    <dd className={`font-semibold ${urgent ? "text-rose-700" : "text-navy"}`}>
                      {eq.maintenance_due ? format(parseISO(eq.maintenance_due), "d MMM yyyy") : "—"}
                      {urgent && ` (${daysToDue < 0 ? "overdue" : `${daysToDue}d`})`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Usage</dt>
                    <dd className="font-semibold text-navy">{eq.usage_hours.toLocaleString()} h</dd>
                  </div>
                </dl>
                {(urgent || eq.status !== "operational") && (
                  <button
                    type="button"
                    className="btn-primary mt-3 px-3 py-1.5 text-xs"
                    disabled={busy}
                    onClick={() => scheduleService(eq.id)}
                  >
                    <Wrench size={14} aria-hidden /> {busy ? "Servicing…" : "Mark serviced & recalibrated"}
                  </button>
                )}
                {serviceErrors[eq.id] && (
                  <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-700">{serviceErrors[eq.id]}</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RegisterEquipmentForm({ onDone }: { onDone: () => void }) {
  const [machineName, setMachineName] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!machineName.trim() || !model.trim()) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("register_equipment", {
      p_machine_name: machineName.trim(),
      p_model: model.trim(),
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setMachineName("");
    setModel("");
    onDone();
  }

  return (
    <form className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3" onSubmit={submit}>
      <div>
        <label htmlFor="eq-name" className="label">Machine name</label>
        <input id="eq-name" className="input" placeholder="e.g. MRI Suite D — 3T" value={machineName} onChange={(e) => setMachineName(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="eq-model" className="label">Model</label>
        <input id="eq-model" className="input" placeholder="e.g. Siemens MAGNETOM Vida" value={model} onChange={(e) => setModel(e.target.value)} required />
      </div>
      <div className="flex items-end">
        <button type="submit" className="btn-primary w-full text-xs" disabled={busy}>
          <PlusCircle size={14} aria-hidden /> {busy ? "Registering…" : "Register (FR53)"}
        </button>
      </div>
      {error && <p className="text-xs font-semibold text-rose-700 sm:col-span-3">{error}</p>}
    </form>
  );
}

// Keyed by the parent on logRefreshKey so a successful register/service
// action forces a fresh fetch (a full remount re-runs useEquipmentServiceLog's
// effect); loaded once on mount otherwise.
function EquipmentServiceLog({ equipment }: { equipment: EquipmentLog[] }) {
  const { data: rows, loadError } = useEquipmentServiceLog();

  if (loadError) {
    return (
      <p role="alert" className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
        Could not load service log: {loadError}
      </p>
    );
  }

  if (!rows) {
    return (
      <p className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
      </p>
    );
  }

  return (
    <div className="mb-4 max-h-64 overflow-y-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pl-3 pr-4">Machine</th>
            <th className="py-2 pr-4">Action</th>
            <th className="py-2 pr-4">Notes</th>
            <th className="py-2 pr-3">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const eq = equipment.find((e) => e.id === r.equipment_id);
            return (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pl-3 pr-4 font-semibold text-navy">{eq?.machine_name ?? r.equipment_id}</td>
                <td className="py-2 pr-4 capitalize">{r.action}</td>
                <td className="py-2 pr-4 text-slate-500">{r.notes ?? "—"}</td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">{format(parseISO(r.performed_at), "d MMM yyyy")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
