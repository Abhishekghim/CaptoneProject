"use client";

import React, { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, HardDriveUpload, ScanLine, Timer } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { PROTOCOLS } from "@/frontend/lib/constants";
import { uploadDicomSeries } from "@/frontend/lib/storage";
import { hasDicomPreamble } from "@/frontend/lib/dicom/parse";
import { readFileBytes } from "@/frontend/lib/dicom/load";
import { createClient } from "@/frontend/lib/supabase/client";
import { EmptyState } from "@/frontend/components/shared/ui";
import type { EquipmentLog } from "@/shared/types";
import type { QueueAppointment } from "@/frontend/components/technician/TodaysQueue";

interface RadiologistOption {
  id: string;
  full_name: string;
  specialty: string | null;
}

// Two queries, not an embedded join — same reasoning as elsewhere in this
// codebase (see TodaysQueue.tsx): avoids ambiguous FK resolution between
// profiles and radiologist_details, and both are small staff-only lists.
export function useRadiologists() {
  const [radiologists, setRadiologists] = useState<RadiologistOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "radiologist")
        .order("full_name", { ascending: true });
      if (cancelled) return;
      if (profilesError) {
        setLoadError(profilesError.message);
        return;
      }
      const { data: details } = await supabase.from("radiologist_details").select("profile_id, specialty");
      if (cancelled) return;
      const specialtyById = new Map((details ?? []).map((d) => [d.profile_id, d.specialty]));
      setLoadError(null);
      setRadiologists((profiles ?? []).map((p) => ({ id: p.id, full_name: p.full_name, specialty: specialtyById.get(p.id) ?? null })));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { radiologists, loadError };
}

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

// Free-text specialty field, so matching is a soft keyword hint (surfaced
// in the dropdown label), not an enforced routing rule — a small clinic's
// specialty labels won't always spell out neatly, and the technician picks
// the actual radiologist either way.
const SPECIALTY_HINTS: Record<string, string[]> = {
  Brain: ["neuro"],
  "Cervical Spine": ["neuro", "spine"],
  "Lumbar Spine": ["neuro", "spine"],
  Shoulder: ["msk", "musculoskeletal", "ortho"],
  "Right Knee": ["msk", "musculoskeletal", "ortho"],
  "Left Knee": ["msk", "musculoskeletal", "ortho"],
  Abdomen: ["body", "abdo"],
  Pelvis: ["body", "abdo", "pelvis"],
};

function specialtyMatches(bodyPart: string, specialty: string | null) {
  if (!specialty) return false;
  const hints = SPECIALTY_HINTS[bodyPart] ?? [];
  const lower = specialty.toLowerCase();
  return hints.some((h) => lower.includes(h));
}

export default function ScanLoggerForm({ appointment: apt, onLogged }: { appointment: QueueAppointment; onLogged: () => void }) {
  const store = useStore();
  const me = store.currentUser;
  const { equipment: machines, loadError: machinesLoadError } = useOperationalEquipment();
  const { radiologists, loadError: radiologistsLoadError } = useRadiologists();

  const [protocol, setProtocol] = useState(PROTOCOLS[0]);
  const [duration, setDuration] = useState(30);
  const [machine, setMachine] = useState("");
  const [radiologistId, setRadiologistId] = useState("");
  const [dicomFiles, setDicomFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  // Only real DICOM Part 10 files go to the bucket; anything else (photos,
  // DICOMDIR-adjacent junk, .DS_Store) is listed back to the technician.
  async function pickFiles(list: FileList | null) {
    const picked = Array.from(list ?? []).filter((f) => !f.name.startsWith("."));
    const ok: File[] = [];
    const bad: File[] = [];
    for (const f of picked) {
      const head = await readFileBytes(f.slice(0, 132));
      (hasDicomPreamble(head) ? ok : bad).push(f);
    }
    setDicomFiles(ok);
    setRejected(bad.map((f) => f.name));
  }

  useEffect(() => {
    if (!machine && machines && machines.length > 0) setMachine(machines[0].machine_name);
  }, [machine, machines]);

  if (!apt) return <EmptyState message="Appointment not found" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!apt) return;
    if (dicomFiles.length === 0) return; // button disabled anyway; belt and braces
    setUploading(true);
    setUploadError(null);
    setUploadProgress({ done: 0, total: dicomFiles.length });
    const result = await uploadDicomSeries(dicomFiles, me.id, `${apt.id}-series`, (done, total) => setUploadProgress({ done, total }));
    setUploadProgress(null);
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
    // Best-effort: the scan is already logged and released at this point
    // regardless of whether this assignment write succeeds, so a failure
    // here doesn't block completion — it just leaves the study unassigned
    // for the radiologist to pick up from the pooled queue instead.
    if (radiologistId) {
      await supabase.from("appointments").update({ assigned_radiologist_id: radiologistId }).eq("id", apt.id);
    }
    setDone(true);
    if (fileRef.current) fileRef.current.value = "";
    if (folderRef.current) folderRef.current.value = "";
    setTimeout(onLogged, 0);
  }

  const sortedRadiologists = (radiologists ?? [])
    .map((r) => ({ ...r, matches: specialtyMatches(apt.body_part, r.specialty) }))
    .sort((a, b) => Number(b.matches) - Number(a.matches));

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
        <label htmlFor="sl-radiologist" className="label">Assign to radiologist (optional)</label>
        <select id="sl-radiologist" className="input" value={radiologistId} onChange={(e) => setRadiologistId(e.target.value)}>
          <option value="">Unassigned — pooled queue</option>
          {sortedRadiologists.map((r) => (
            <option key={r.id} value={r.id}>
              {r.full_name}
              {r.specialty ? ` — ${r.specialty}` : ""}
              {r.matches ? " (specialty match)" : ""}
            </option>
          ))}
        </select>
        {radiologistsLoadError && (
          <p role="alert" className="mt-1 text-xs font-semibold text-rose-700">
            Could not load radiologists: {radiologistsLoadError}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="sl-dicom" className="label">DICOM series upload</label>
        <input
          id="sl-dicom" ref={fileRef} type="file" multiple
          onChange={(e) => pickFiles(e.target.files)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-medical-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-medical hover:file:bg-sky-100"
        />
        <input
          ref={folderRef} type="file" multiple className="hidden"
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => pickFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => folderRef.current?.click()}
          className="mt-2 text-xs font-semibold text-medical underline-offset-2 hover:underline"
        >
          Or choose the series folder exported from the scanner
        </button>
        <p className="mt-1 text-xs text-slate-500">Select every image of the series (DICOM Part 10 files). They are stored together as one study.</p>
        {dicomFiles.length > 0 && (
          <p className="mt-1 text-xs text-emerald-700">
            <HardDriveUpload size={12} className="inline" aria-hidden /> {dicomFiles.length} DICOM {dicomFiles.length === 1 ? "file" : "files"} ready — will upload to the secure DICOM bucket
          </p>
        )}
        {rejected.length > 0 && (
          <p role="alert" className="mt-1 text-xs font-semibold text-amber-700">
            Skipped {rejected.length} {rejected.length === 1 ? "file that isn't" : "files that aren't"} DICOM: {rejected.slice(0, 3).join(", ")}{rejected.length > 3 ? "…" : ""}
          </p>
        )}
        {uploadProgress && (
          <p role="status" className="mt-1 text-xs text-slate-600">Uploading {uploadProgress.done} of {uploadProgress.total}…</p>
        )}
        {uploadError && <p className="mt-1 text-xs font-semibold text-rose-700">{uploadError}</p>}
      </div>

      <div className="md:col-span-2">
        <button type="submit" className="btn-primary" disabled={dicomFiles.length === 0 || !machine || uploading}>
          <ScanLine size={16} aria-hidden /> {uploading ? "Uploading…" : "Log scan & release to radiology"}
        </button>
      </div>
    </form>
  );
}
