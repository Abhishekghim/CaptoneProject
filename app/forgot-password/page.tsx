"use client";

// Local-demo password reset — see the note in lib/auth/local-accounts.ts.
// There's no email service connected (no backend yet), so this can't send a
// reset link the way a real deployment would. It verifies the email belongs
// to an existing account and lets you set a new password immediately. That
// limitation is stated plainly below rather than pretending an email was sent.

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, KeyRound } from "lucide-react";
import { accountExists, resetPassword } from "@/lib/auth/local-accounts";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!accountExists(email)) {
      setError("No account found with that email.");
      return;
    }
    if (newPassword.length < 4) {
      setError("New password must be at least 4 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    const result = resetPassword(email, newPassword);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
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
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Local demo mode: there's no email service connected yet, so this can't send you a reset link. Confirm
            your account email below and your new password takes effect immediately.
          </p>

          {done ? (
            <div className="mt-5 space-y-4">
              <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Password updated. You can sign in with your new password now.
              </p>
              <button type="button" className="btn-primary w-full justify-center py-2.5" onClick={() => router.push("/login")}>
                Go to sign in
              </button>
            </div>
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

              <div>
                <label htmlFor="new_password" className="mb-1 block text-xs font-semibold text-slate-600">
                  New password
                </label>
                <input
                  id="new_password"
                  type="password"
                  required
                  minLength={4}
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
                  minLength={4}
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

              <button type="submit" className="btn-primary w-full justify-center py-2.5">
                <KeyRound size={16} aria-hidden />
                Reset password
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
