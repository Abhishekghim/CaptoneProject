"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Send, UserPlus } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { BODY_PARTS } from "@/frontend/lib/constants";
import { createClient } from "@/frontend/lib/supabase/client";
import { SectionTitle } from "@/frontend/components/shared/ui";

// Inserts directly into the real doctor_referrals table — RLS
// (doctor_referrals_doctor_insert) already restricts referring_doctor_id to
// the caller, and the before-insert trigger (match_doctor_referral_on_insert)
// fills in patient_id itself if a matching patient account already exists,
// so there's no client-side matching logic to port here.
//
// onCreated is optional now that "Refer a patient" and "Referrals I've
// sent" live on separate routes (app/(app)/dashboard/refer and
// .../referrals-sent) — the sent-list page re-fetches on its own mount, so
// there's no sibling list on this page left to reload.
export default function NewReferralPanel({ onCreated }: { onCreated?: () => void }) {
  const store = useStore();
  const me = store.currentUser;
  const [patientFullName, setPatientFullName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientDob, setPatientDob] = useState("");
  const [bodyPart, setBodyPart] = useState(BODY_PARTS[0]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    const email = patientEmail.trim().toLowerCase();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("doctor_referrals")
      .insert({
        referring_doctor_id: me.id,
        patient_full_name: patientFullName.trim(),
        patient_email: email,
        patient_dob: patientDob || null,
        body_part: bodyPart,
        notes: notes.trim() || null,
      })
      .select()
      .single();
    setSubmitting(false);
    if (error) {
      setFeedback({ ok: false, text: error.message || "Could not save this referral. Please try again." });
      return;
    }
    const matchedExistingPatient = Boolean(data?.patient_id);
    setFeedback({
      ok: true,
      text: matchedExistingPatient
        ? `${patientFullName} already has a patient account — they've been notified and this referral is ready for them to book.`
        : `Referral saved for ${patientFullName}. It'll automatically attach to their account the moment they sign up with ${email}.`,
    });
    setPatientFullName("");
    setPatientEmail("");
    setPatientDob("");
    setNotes("");
    onCreated?.();
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
          <button type="submit" className="btn-primary" disabled={submitting}>
            <Send size={16} aria-hidden /> {submitting ? "Sending…" : "Send referral"}
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
      {feedback?.ok && (
        <p className="mt-2 text-sm">
          <Link href="/dashboard/referrals-sent" className="font-semibold text-medical hover:underline">
            View your sent referrals →
          </Link>
        </p>
      )}
    </section>
  );
}
