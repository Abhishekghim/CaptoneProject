"use client";

import React, { useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, FileSignature, FileUp, Paperclip, Send, UserPlus, Users } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { BODY_PARTS } from "@/frontend/lib/seed";
import { uploadToBucket } from "@/frontend/lib/storage";
import { EmptyState, SectionTitle, StatusChip } from "@/frontend/components/shared/ui";

export default function ReferringDoctorPortal() {
  const store = useStore();
  const me = store.currentUser;

  const myReferrals = store.appointments
    .filter((a) => a.referring_doctor_id === me.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const myDoctorReferrals = store.doctorReferrals
    .filter((r) => r.referring_doctor_id === me.id)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <NewReferralPanel />

      <section id="referrals-sent" className="card p-5 sm:p-6">
        <SectionTitle
          icon={Send}
          title="Referrals I've sent"
          subtitle="Patients you've referred, whether or not they've booked yet"
        />
        {myDoctorReferrals.length === 0 ? (
          <EmptyState
            message="No referrals sent yet"
            hint="Use the form above to refer a patient — they'll see it waiting for them the moment they have an account."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {myDoctorReferrals.map((r) => {
              const appointment = r.used_in_appointment_id
                ? store.appointments.find((a) => a.id === r.used_in_appointment_id)
                : undefined;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-navy">
                      {r.patient_full_name} — {r.body_part}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.patient_email}
                      {r.patient_dob && ` · DOB ${format(parseISO(r.patient_dob), "d MMM yyyy")}`}
                    </p>
                    {r.notes && <p className="mt-1 text-xs text-slate-500">&ldquo;{r.notes}&rdquo;</p>}
                  </div>
                  {appointment ? (
                    <span className="chip bg-emerald-100 text-emerald-800">
                      Booked — {format(parseISO(appointment.date), "d MMM yyyy")}
                    </span>
                  ) : r.patient_id ? (
                    <span className="chip bg-sky-100 text-sky-800">Waiting for patient to book</span>
                  ) : (
                    <span className="chip bg-slate-200 text-slate-700">Awaiting patient sign-up</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

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

/* ------------------------------------------------------------------ */
function NewReferralPanel() {
  const store = useStore();
  const [patientFullName, setPatientFullName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientDob, setPatientDob] = useState("");
  const [bodyPart, setBodyPart] = useState(BODY_PARTS[0]);
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = store.createDoctorReferral({
      patientFullName, patientEmail, patientDob: patientDob || null, bodyPart, notes: notes || null,
    });
    if (result.ok) {
      setFeedback({
        ok: true,
        text: result.matchedExistingPatient
          ? `${patientFullName} already has a patient account — they've been notified and this referral is ready for them to book.`
          : `Referral saved for ${patientFullName}. It'll automatically attach to their account the moment they sign up with ${patientEmail}.`,
      });
      setPatientFullName("");
      setPatientEmail("");
      setPatientDob("");
      setNotes("");
    } else {
      setFeedback({ ok: false, text: result.error ?? "Could not save this referral. Please try again." });
    }
  }

  return (
    <section id="refer-a-patient" className="card p-5 sm:p-6">
      <SectionTitle
        icon={UserPlus}
        title="Refer a patient"
        subtitle="No account needed on their end yet — this attaches automatically once they sign up"
      />
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="ref-name" className="label">Patient full name</label>
          <input
            id="ref-name" required className="input" value={patientFullName}
            onChange={(e) => setPatientFullName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="ref-email" className="label">Patient email</label>
          <input
            id="ref-email" type="email" required className="input" value={patientEmail}
            onChange={(e) => setPatientEmail(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-400">Used to match this referral to their account — theirs, not yours.</p>
        </div>
        <div>
          <label htmlFor="ref-dob" className="label">Patient date of birth <span className="font-normal text-slate-400">(optional)</span></label>
          <input
            id="ref-dob" type="date" className="input" value={patientDob}
            onChange={(e) => setPatientDob(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="ref-body" className="label">Requested scan</label>
          <select id="ref-body" className="input" value={bodyPart} onChange={(e) => setBodyPart(e.target.value)}>
            {BODY_PARTS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="ref-notes" className="label">Clinical notes <span className="font-normal text-slate-400">(optional)</span></label>
          <textarea id="ref-notes" rows={2} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <button type="submit" className="btn-primary">
            <Send size={16} aria-hidden /> Send referral
          </button>
        </div>
      </form>
      {feedback && (
        <p
          role="status"
          className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-sm ${
            feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {feedback.ok && <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />}
          {feedback.text}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
function ReferralUpload({ appointmentId }: { appointmentId: string }) {
  const store = useStore();
  const me = store.currentUser;
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    const result = await uploadToBucket("referrals", file, me.id);
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    store.uploadReferral(appointmentId, result.path);
    setDone(true);
    setTimeout(() => setDone(false), 2500);
    if (fileRef.current) fileRef.current.value = "";
    setFile(null);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-medical-light file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-medical hover:file:bg-sky-100"
      />
      <button type="button" onClick={upload} disabled={!file || uploading} className="btn-ghost text-xs disabled:opacity-50">
        <FileUp size={13} aria-hidden /> {uploading ? "Uploading…" : "Upload / update referral"}
      </button>
      {done && <span className="text-xs font-semibold text-emerald-700">Referral uploaded to secure storage.</span>}
      {error && <span className="text-xs font-semibold text-rose-700">{error}</span>}
    </div>
  );
}
