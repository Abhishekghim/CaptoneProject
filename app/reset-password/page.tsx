"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Landing page for the link sent by supabase.auth.resetPasswordForEmail()
// (see app/forgot-password/page.tsx). The recovery token lives in the URL;
// the Supabase client parses it and fires a PASSWORD_RECOVERY auth event
// once a temporary session is ready, which is what actually lets
// updateUser() below succeed.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Covers the case where the event already fired before this listener attached.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message || "Could not update your password. Please try again.");
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
          <h1 className="text-lg font-bold text-navy">Set a new password</h1>

          {done ? (
            <div className="mt-5 space-y-4">
              <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Password updated.
              </p>
              <button
                type="button"
                className="btn-primary w-full justify-center py-2.5"
                onClick={() => {
                  router.push("/dashboard");
                  router.refresh();
                }}
              >
                Continue to your dashboard
              </button>
            </div>
          ) : !ready ? (
            <p className="mt-5 text-sm text-slate-500">
              Verifying your reset link&hellip; if this doesn&rsquo;t update in a few seconds, the link may have
              expired —{" "}
              <a href="/forgot-password" className="font-semibold text-medical hover:underline">
                request a new one
              </a>
              .
            </p>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="new_password" className="mb-1 block text-xs font-semibold text-slate-600">
                  New password
                </label>
                <input
                  id="new_password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="input w-full"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="confirm_password" className="mb-1 block text-xs font-semibold text-slate-600">
                  Confirm new password
                </label>
                <input
                  id="confirm_password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="input w-full"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              {error && (
                <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              )}

              <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-2.5">
                <KeyRound size={16} aria-hidden />
                {submitting ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
