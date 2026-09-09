"use client";

import React, { useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle, CalendarClock, CheckCircle2, HardDriveUpload, Play, ScanLine, Timer,
} from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { PROTOCOLS } from "@/frontend/lib/seed";
import { uploadToBucket } from "@/frontend/lib/storage";
import { EmptyState, SectionTitle, StatusChip } from "@/frontend/components/shared/ui";
import StaffMessagingPanel from "@/frontend/components/shared/StaffMessagingPanel";

export default function TechnicianPortal() {
  const store = useStore();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const todaysQueue = useMemo(
    () =>
      store.appointments
        .filter((a) => a.date === todayStr && (a.status === "scheduled" || a.status === "in_progress"))
        .sort((a, b) => a.time_slot.localeCompare(b.time_slot)),
    [store.appointments, todayStr]
  );

  const inProgress = todaysQueue.filter((a) => a.status === "in_progress");
  const [loggingFor, setLoggingFor] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <section id="today-s-queue" className="card p-5 sm:p-6">
        <SectionTitle
          icon={CalendarClock}
          title={`Today's MRI queue — ${format(new Date(), "EEEE d MMMM")}`}
          subtitle={`${todaysQueue.length} patient${todaysQueue.length === 1 ? "" : "s"} scheduled or in progress`}
        />
        {todaysQueue.length === 0 ? (
          <EmptyState
            message="No scans left in today's queue"
            hint="New online bookings for today will appear here automatically."
          />
        ) : (
          <ul className="space-y-3">
            {todaysQueue.map((a) => {
              const patient = store.profiles.find((p) => p.id === a.patient_id);
              const record = store.records.find((r) => r.patient_id === a.patient_id);
              const flags = record
                ? (Object.entries(record.contraindications) as [string, boolean | string | null][])
                    .filter(([k, v]) => k !== "other" && v === true)
                    .map(([k]) => k.replace(/_/g, " "))
                : [];
              if (record?.contraindications.other) flags.push(record.contraindications.other);

              const referringLabel = a.referring_doctor_id
                ? store.profiles.find((p) => p.id === a.referring_doctor_id)?.full_name ?? "Unknown doctor"
                : a.referring_doctor_name;
              const hasReferralToCheck = Boolean(a.referral_url || a.referring_doctor_name);
              const assignedTech = a.assigned_technician_id
                ? store.profiles.find((p) => p.id === a.assigned_technician_id)
                : null;

              return (
                <li key={a.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-navy">
                        {a.time_slot} — {patient?.full_name ?? "Unknown patient"} · {a.body_part}
                      </p>
                      <p className="text-xs text-slate-500">{a.location}</p>
                      {assignedTech && (
                        <p className="mt-1 text-xs font-semibold text-medical">
                          {assignedTech.id === store.currentUser.id ? "Assigned to you" : `Assigned to ${assignedTech.full_name}`}
                        </p>
                      )}
                      {referringLabel && (
                        <p className="mt-1 text-xs text-slate-500">
                          Referred by {referringLabel}
                          {a.referring_doctor_practice && ` · ${a.referring_doctor_practice}`}
                          {!a.referring_doctor_id && (
                            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              No account yet
                            </span>
                          )}
                        </p>
                      )}
                      {flags.length > 0 && (
                        <p className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                          <AlertTriangle size={13} aria-hidden />
                          Safety flags: {flags.join(", ")}
                        </p>
                      )}
                      {hasReferralToCheck && (
                        a.referral_reviewed ? (
                          <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                            <CheckCircle2 size={13} aria-hidden /> Referral reviewed
                          </p>
                        ) : (
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                              <AlertTriangle size={13} aria-hidden /> Referral needs review
                            </span>
                            <button
                              type="button"
                              className="btn-ghost text-xs"
                              onClick={() => store.acknowledgeReferral(a.id)}
                            >
                              <CheckCircle2 size={13} aria-hidden /> Mark reviewed
                            </button>
                          </div>
                        )
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusChip status={a.status} />
                      {a.status === "scheduled" ? (
                        <button type="button" className="btn-ghost text-xs" onClick={() => store.startScan(a.id)}>
                          <Play size={14} aria-hidden /> Start scan
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary text-xs"
                          onClick={() => setLoggingFor(a.id)}
                          aria-expanded={loggingFor === a.id}
                        >
                          <ScanLine size={14} aria-hidden /> Log completed scan
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="scan-logger" className="card p-5 sm:p-6">
        <SectionTitle
          icon={ScanLine}
          title="Scan logger"
          subtitle="Record the procedure and upload the DICOM series — this releases the study to radiology"
        />
        {inProgress.length === 0 ? (
          <EmptyState
            message="No scan is in progress"
            hint='Press "Start scan" on a queued appointment to open the logger.'
          />
        ) : (
          <ScanLoggerForm
            appointmentId={loggingFor ?? inProgress[0].id}
            onLogged={() => setLoggingFor(null)}
          />
        )}
      </section>

      <StaffMessagingPanel />
    </div>
  );
}

function ScanLoggerForm({ appointmentId, onLogged }: { appointmentId: string; onLogged: () => void }) {
  const store = useStore();
  const me = store.currentUser;
  const apt = store.appointments.find((a) => a.id === appointmentId);
  const patient = apt && store.profiles.find((p) => p.id === apt.patient_id);
  const machines = store.equipment.filter((e) => e.status === "operational");

  const [protocol, setProtocol] = useState(PROTOCOLS[0]);
  const [duration, setDuration] = useState(30);
  const [machine, setMachine] = useState(machines[0]?.machine_name ?? "");
  const [dicomFile, setDicomFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!apt) return <EmptyState message="Appointment not found" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!apt) return;
    if (!dicomFile) return; // button disabled anyway; belt and braces
    setUploading(true);
    setUploadError(null);
    const result = await uploadToBucket("dicom", dicomFile, me.id);
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }
    store.logScan({
      appointment_id: apt.id,
      body_part: apt.body_part,
      protocol,
      scan_duration: duration,
      machine_name: machine,
      dicomFileName: result.path,
    });
    setDone(true);
    if (fileRef.current) fileRef.current.value = "";
    setTimeout(onLogged, 0);
  }

  if (done) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
        <CheckCircle2 size={18} aria-hidden />
        Scan logged for {patient?.full_name}. The study is now in the radiologist&apos;s unreported queue.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg bg-slate-50 p-4 text-sm md:col-span-2">
        <p className="font-semibold text-navy">
          {patient?.full_name} — {apt.body_part}
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
          {machines.map((m) => (
            <option key={m.id} value={m.machine_name}>{m.machine_name} · {m.model}</option>
          ))}
        </select>
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
