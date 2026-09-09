"use client";

import React, { useState } from "react";
import { Activity, Send, Stethoscope } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";

const AHPRA_PATTERN = /^[A-Za-z]{3}[0-9]{10}$/;

// For referring doctors only. Unlike app/signup/page.tsx (patients, instant
// self-registration) a referring doctor is external to the business, so
// there's no account created here — this only files a request. An admin
// reviews it in their dashboard and approves or rejects it; approval is what
// actually creates the login (see the approve API route). This page never
// touches supabase.auth — a person can submit this form with no account and
// nothing is provisioned until someone reviews it.
export default function RequestDoctorAccessPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [ahpraNumber, setAhpraNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedAhpra = ahpraNumber.trim().toUpperCase();
    if (!AHPRA_PATTERN.test(trimmedAhpra)) {
      setError("Enter a valid AHPRA registration number: 3 letters followed by 10 digits (e.g. MED0001234567).");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();

      // Anonymous insert, allowed by the "doctor_requests_public_insert" RLS
      // policy (backend/database/004_referring_doctor_requests.sql) — it only lets a
      // caller create a fresh 'pending' row with no review fields, so this
      // can't be used to forge an approval. A duplicate submission for the
      // same email while one is still pending is rejected by a unique index,
      // surfaced below as a friendly message rather than a raw DB error.
      const { error: insertError } = await supabase.from("referring_doctor_requests").insert({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        practice_name: practiceName.trim(),
        ahpra_number: trimmedAhpra,
        phone: phone.trim() || null,
        message: message.trim() || null,
      });

      if (insertError) {
        // Two distinct DB-side guards can reject this insert (see
        // backend/database/004_referring_doctor_requests.sql): a unique index blocks
        // a second pending request for the same email (raw Postgres error
        // code 23505), and a trigger blocks requesting access for an email
        // that already has any account, with its own friendly message.
        if (insertError.code === "23505") {
          setError("A request for this email is already pending review. We'll be in touch once it's been reviewed.");
        } else if (insertError.message?.includes("account already exists")) {
          setError(insertError.message);
        } else {
          setError(insertError.message || "Could not submit your request. Please try again.");
        }
        return;
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-medical">
            <Activity size={22} className="text-white" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-navy">Capital Radiology</p>
            <p className="text-[11px] text-slate-500">Online MRI portal</p>
          </div>
        </div>

        <div className="card p-6 sm:p-7">
          <div className="mb-1 flex items-center gap-2">
            <Stethoscope size={18} className="text-medical" aria-hidden />
            <h1 className="text-lg font-bold text-navy">Request referring-doctor access</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            For external GPs and specialists who refer patients to us. Submit your details below and an
            administrator will review your request — this does not create a login right away.
          </p>

          {submitted ? (
            <div role="status" className="mt-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="font-semibold">Request submitted.</p>
              <p className="mt-1">
                Our admin team will review your details and email you at the address you provided once a
                decision has been made.
              </p>
            </div>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="full_name" className="mb-1 block text-xs font-semibold text-slate-600">
                  Full name
                </label>
                <input
                  id="full_name"
                  type="text"
                  required
                  autoComplete="name"
                  className="input w-full"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="email" className="mb-1 block text-xs font-semibold text-slate-600">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="input w-full"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  If approved, your account invite is sent to this address.
                </p>
              </div>

              <div>
                <label htmlFor="practice_name" className="mb-1 block text-xs font-semibold text-slate-600">
                  Practice / clinic name
                </label>
                <input
                  id="practice_name"
                  type="text"
                  required
                  className="input w-full"
                  value={practiceName}
                  onChange={(e) => setPracticeName(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="ahpra_number" className="mb-1 block text-xs font-semibold text-slate-600">
                  AHPRA registration number
                </label>
                <input
                  id="ahpra_number"
                  type="text"
                  required
                  placeholder="e.g. MED0001234567"
                  pattern="[A-Za-z]{3}[0-9]{10}"
                  title="3 letters followed by 10 digits, e.g. MED0001234567"
                  className="input w-full uppercase"
                  value={ahpraNumber}
                  onChange={(e) => setAhpraNumber(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="phone" className="mb-1 block text-xs font-semibold text-slate-600">
                  Phone <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  className="input w-full"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="message" className="mb-1 block text-xs font-semibold text-slate-600">
                  Anything else? <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="message"
                  rows={3}
                  className="input w-full"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {error && (
                <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              )}

              <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-2.5">
                <Send size={16} aria-hidden />
                {submitting ? "Submitting…" : "Submit request"}
              </button>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-slate-500">
            Already approved?{" "}
            <a href="/login" className="font-semibold text-medical hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
