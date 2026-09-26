"use client";

import React, { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, HardDriveUpload, ScanLine, Timer } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { PROTOCOLS } from "@/frontend/lib/constants";
import { uploadToBucket } from "@/frontend/lib/storage";
import { createClient } from "@/frontend/lib/supabase/client";
import { EmptyState } from "@/frontend/components/shared/ui";
import type { EquipmentLog } from "@/shared/types";
import type { QueueAppointment } from "@/frontend/components/technician/TodaysQueue";

export function useOperationalEquipment() {
  const [equipment, setEquipment] = useState<EquipmentLog[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("equipment_logs")
        .select("*")
        .eq("status", "operational")
        .order("machine_name", { ascending: true });
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        return;
      }
      setLoadError(null);
      setEquipment((data ?? []) as EquipmentLog[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { equipment, loadError };
}

export default function ScanLoggerForm({ appointment: apt, onLogged }: { appointment: QueueAppointment; onLogged: () => void }) {
  const store = useStore();
  const me = store.currentUser;
  const { equipment: machines, loadError: machinesLoadError } = useOperationalEquipment();

  const [protocol, setProtocol] = useState(PROTOCOLS[0]);
  const [duration, setDuration] = useState(30);
  const [machine, setMachine] = useState("");
  const [dicomFile, setDicomFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!machine && machines && machines.length > 0) setMachine(machines[0].machine_name);
  }, [machine, machines]);

  if (!apt) return <EmptyState message="Appointment not found" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!apt) return;
    if (!dicomFile) return; // button disabled anyway; belt and braces
    setUploading(true);
    setUploadError(null);
    const result = await uploadToBucket("dicom", dicomFile, me.id);
    if (!result.ok) {
      setUploading(false);
      setUploadError(result.error);
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("log_scan", {
      p_appointment_id: apt.id,
      p_body_part: apt.body_part,
      p_protocol: protocol,
      p_scan_duration: duration,
      p_machine_name: machine,
      p_dicom_image_url: result.path,
    });
    setUploading(false);
    if (error) {
      setUploadError(error.message);
      return;
    }
    setDone(true);
    if (fileRef.current) fileRef.current.value = "";
    setTimeout(onLogged, 0);
  }

  if (done) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
        <CheckCircle2 size={18} aria-hidden />
        Scan logged for {apt.patient_name}. The study is now in the radiologist&apos;s unreported queue.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg bg-slate-50 p-4 text-sm md:col-span-2">
        <p className="font-semibold text-navy">
          {apt.patient_name} — {apt.body_part}
        </p>
        <p className="text-xs text-slate-500">
          {format(parseISO(apt.date), "d MMM yyyy")} {apt.time_slot} · {apt.location}
        </p>
      </div>

      <div>
        <label htmlFor="sl-protocol" className="label">Protocol</label>
        <select id="sl-protocol" className="input" value={protocol} onChange={(e) => setProtocol(e.target.value)}>
          {PROTOCOLS.map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="sl-machine" className="label">Machine used</label>
        <select id="sl-machine" className="input" value={machine} onChange={(e) => setMachine(e.target.value)}>
          {(machines ?? []).map((m) => (
            <option key={m.id} value={m.machine_name}>{m.machine_name} · {m.model}</option>
          ))}
        </select>
        {machinesLoadError && (
          <p role="alert" className="mt-1 text-xs font-semibold text-rose-700">
            Could not load equipment list: {machinesLoadError}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="sl-duration" className="label">
          <Timer size={12} className="mr-1 inline" aria-hidden />
          Scan duration: <span className="font-bold text-navy">{duration} min</span>
        </label>
        <input
          id="sl-duration" type="range" min={10} max={90} step={1}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="w-full accent-medical"
        />
      </div>

      <div>
        <label htmlFor="sl-dicom" className="label">DICOM series upload</label>
        <input
          id="sl-dicom" ref={fileRef} type="file"
          onChange={(e) => setDicomFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-medical-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-medical hover:file:bg-sky-100"
        />
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([`Simulated DICOM series for appointment ${apt.id}`], { type: "application/dicom" });
            setDicomFile(new File([blob], `${apt.id}-series.dcm`, { type: "application/dicom" }));
          }}
          className="mt-2 text-xs font-semibold text-medical underline-offset-2 hover:underline"
        >
          Or generate a simulated series from the scanner
        </button>
        {dicomFile && (
          <p className="mt-1 text-xs text-emerald-700">
            <HardDriveUpload size={12} className="inline" aria-hidden /> {dicomFile.name} ready — will upload to the secure DICOM bucket
          </p>
        )}
        {uploadError && <p className="mt-1 text-xs font-semibold text-rose-700">{uploadError}</p>}
      </div>

      <div className="md:col-span-2">
        <button type="submit" className="btn-primary" disabled={!dicomFile || !machine || uploading}>
          <ScanLine size={16} aria-hidden /> {uploading ? "Uploading…" : "Log scan & release to radiology"}
        </button>
      </div>
    </form>
  );
}
