"use client";

import React, { useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { FileSignature, FileUp, Paperclip, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { EmptyState, SectionTitle, StatusChip } from "@/components/shared/ui";

export default function ReferringDoctorPortal() {
  const store = useStore();
  const me = store.currentUser;

  const myReferrals = store.appointments
    .filter((a) => a.referring_doctor_id === me.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <section id="my-referrals" className="card p-5 sm:p-6">
        <SectionTitle
          icon={Users}
          title="My referred patients"
          subtitle="Appointments where you're listed as the referring doctor"
        />
        {myReferrals.length === 0 ? (
          <EmptyState
            message="No referred appointments yet"
            hint="When a patient selects you as their referring doctor at booking, it appears here."
          />
        ) : (
          <ul className="space-y-4">
            {myReferrals.map((a) => {
              const patient = store.profiles.find((p) => p.id === a.patient_id);
              const scan = store.scans.find((s) => s.appointment_id === a.id);
              const report = scan ? store.reports.find((r) => r.scan_id === scan.id) : undefined;
              const finalized = report?.status === "finalized";
              return (
                <li key={a.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-navy">
                        {patient?.full_name ?? "Unknown patient"} — {a.body_part}
                      </p>
                      <p className="text-xs text-slate-500">
                        {format(parseISO(a.date), "d MMM yyyy")} {a.time_slot} · {a.location}
                      </p>
                      {a.referral_url && (
                        <p className="mt-1 text-xs text-emerald-700">
                          <Paperclip size={12} className="inline" aria-hidden /> {a.referral_url.split("/").pop()}
                        </p>
                      )}
                    </div>
                    <StatusChip status={a.status} />
                  </div>

                  <ReferralUpload appointmentId={a.id} />

                  {finalized && report && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <FileSignature size={13} aria-hidden /> Finalized report
                      </p>
                      <p className="text-slate-700">
                        <span className="font-semibold text-navy">Findings:</span> {report.findings}
                      </p>
                      <p className="mt-1 text-slate-700">
                        <span className="font-semibold text-navy">Impression:</span> {report.impression}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Signed: {report.e_signature}</p>
                    </div>
                  )}
                  {!finalized && (
                    <p className="mt-2 text-xs text-slate-400">Report not yet finalized — it will appear here once signed.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReferralUpload({ appointmentId }: { appointmentId: string }) {
  const store = useStore();
  const [fileName, setFileName] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function upload() {
    const name = fileName ?? `${appointmentId}-referral.pdf`;
    store.uploadReferral(appointmentId, name);
    setDone(true);
    setTimeout(() => setDone(false), 2500);
    if (fileRef.current) fileRef.current.value = "";
    setFileName(null);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,image/*"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        className="text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-medical-light file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-medical hover:file:bg-sky-100"
      />
      <button type="button" onClick={upload} className="btn-ghost text-xs">
        <FileUp size={13} aria-hidden /> Upload / update referral
      </button>
      {done && <span className="text-xs font-semibold text-emerald-700">Referral attached.</span>}
    </div>
  );
}
