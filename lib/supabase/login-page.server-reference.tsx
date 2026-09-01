// REFERENCE ONLY — not a route file. The real, working Supabase version of
// app/login/page.tsx, saved while the app runs on temporary local-only auth.
// To go live: copy this back over app/login/page.tsx (keep the Suspense
// wrapper — useSearchParams() requires it for static generation).

"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const supabase = createClient();

      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Invalid email or password. Please try again.");
        return;
      }
      if (!data.user) {
        setError("Something went wrong signing you in. Please try again.");
        return;
      }

      // Role is always looked up server-side from `profiles`, never chosen
      // client-side — the user cannot select or influence it on this page.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (profileError || !profile) {
        setError("Signed in, but no profile was found for this account. Contact an administrator.");
        await supabase.auth.signOut();
        return;
      }

      // Single-page dashboard renders per-role server-side, so every role
      // lands on "/" — there is no separate URL per role to route to.
      const redirectTo = searchParams.get("redirectTo") || "/";
      router.push(redirectTo);
      router.refresh();
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
              <label htmlFor="password" className="mb-1 block text-xs font-semibold text-slate-600">
                Password
              </label>
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
      </div>
    </div>
  );
}
