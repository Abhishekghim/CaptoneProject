"use client";

// TEMPORARY: local-only auth (no Supabase, nothing persisted — see
// lib/auth/local-accounts.ts). The real, working Supabase version of this
// page is saved at lib/supabase/login-page.server-reference.tsx.

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, LogIn } from "lucide-react";
import { useSession } from "@/lib/auth/SessionContext";
import { DEMO_CREDENTIALS, findAccount } from "@/lib/auth/local-accounts";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Role is never chosen here — it comes from whichever account matched.
    const profile = findAccount(email, password);
    if (!profile) {
      setError("Invalid email or password. Please try again.");
      setSubmitting(false);
      return;
    }

    login(profile);
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
          <h1 className="text-lg font-bold text-navy">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Use your email and password to access your account.</p>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
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
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-600">
                  Password
                </label>
                <a href="/forgot-password" className="text-xs font-semibold text-medical hover:underline">
                  Forgot password?
                </a>
              </div>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
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
              <LogIn size={16} aria-hidden />
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            New patient?{" "}
            <a href="/signup" className="font-semibold text-medical hover:underline">
              Create an account
            </a>
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-600">
          <p className="mb-2 font-semibold uppercase tracking-wide text-slate-500">
            Local demo accounts — password is the same for all
          </p>
          <ul className="space-y-1 font-mono">
            {DEMO_CREDENTIALS.map((c) => (
              <li key={c.email}>
                {c.email} <span className="text-slate-400">/ {c.password}</span>{" "}
                <span className="text-slate-400">({c.role})</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
