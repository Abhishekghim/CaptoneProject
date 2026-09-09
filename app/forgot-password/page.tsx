"use client";

import React, { useState } from "react";
import { Activity, Mail } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const supabase = createClient();
      // Always shows the same success state regardless of whether the email
      // matches an account — Supabase does the same server-side, so this
      // page can't be used to enumerate which addresses have accounts.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) {
        setError(resetError.message || "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
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
          <h1 className="text-lg font-bold text-navy">Reset your password</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your account email and we&rsquo;ll send you a link to set a new password.
          </p>

          {done ? (
            <p role="status" className="mt-5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).
            </p>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="mb-1 block text-xs font-semibold text-slate-600">
                  Account email
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
              </div>

              {error && (
                <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              )}

              <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-2.5">
                <Mail size={16} aria-hidden />
                {submitting ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-slate-500">
            <a href="/login" className="font-semibold text-medical hover:underline">
              Back to sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
