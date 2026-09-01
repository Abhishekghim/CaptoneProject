"use client";

// TEMPORARY: local-only auth (no Supabase, nothing persisted — see
// lib/auth/local-accounts.ts). The real, working Supabase version of this
// page is saved at lib/supabase/signup-page.server-reference.tsx.
//
// Patients only. There is deliberately no role field anywhere on this page —
// role is never chosen by the user, on this form or any other; it's
// hardcoded to 'patient' inside createPatientAccount().
//
// Staff accounts (technician, radiologist, admin) are NOT self-registerable
// here or anywhere else in the app — see the premade demo accounts on the
// login page for those roles.

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, UserPlus } from "lucide-react";
import { useSession } from "@/lib/auth/SessionContext";
import { createPatientAccount } from "@/lib/auth/local-accounts";

export default function SignupPage() {
  const router = useRouter();
  const { login } = useSession();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = createPatientAccount(email, password, fullName);
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    login(result.profile);
    router.push("/dashboard");
    setSubmitting(false);
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
          <h1 className="text-lg font-bold text-navy">Create a patient account</h1>
          <p className="mt-1 text-sm text-slate-500">
            For staff accounts, contact an administrator — this form is for patients only.
          </p>
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Local demo mode: this account is stored in memory only and will disappear on page reload.
          </p>

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
                Email
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
              <label htmlFor="password" className="mb-1 block text-xs font-semibold text-slate-600">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={4}
                autoComplete="new-password"
                className="input w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-2.5">
              <UserPlus size={16} aria-hidden />
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <a href="/login" className="font-semibold text-medical hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
