"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, LogIn, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

const GENERIC_ERROR = "Invalid email/username or password. Please try again.";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("reason") === "deactivated"
      ? "This account has been deactivated. Contact an administrator."
      : searchParams.get("error") === "oauth_failed"
      ? "Google sign-in failed. Please try again."
      : null
  );
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    const supabase = createClient();
    const redirectTo = searchParams.get("redirectTo") || "/dashboard";
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      },
    });
    if (oauthError) {
      setError(oauthError.message || "Could not start Google sign-in. Please try again.");
      setGoogleLoading(false);
    }
    // On success the browser navigates away to Google — nothing left to do here.
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const supabase = createClient();
      const trimmed = identifier.trim();

      // supabase.auth.signInWithPassword() only accepts an email, so a
      // non-email identifier needs resolving to one first. Deliberately the
      // *same* generic error either way below — a distinct "no such
      // username" message would let someone enumerate valid usernames.
      let email = trimmed;
      if (!trimmed.includes("@")) {
        const { data: resolvedEmail, error: rpcError } = await supabase.rpc("get_email_for_username", {
          p_username: trimmed,
        });
        if (rpcError || !resolvedEmail) {
          // Logged under the typed identifier, not a resolved email — there
          // isn't one yet, and this still lets a real account being brute-
          // forced by username show up in the admin's security alerts.
          await supabase.rpc("log_failed_login", { p_email: trimmed, p_detail: "unknown username" });
          setError(GENERIC_ERROR);
          return;
        }
        email = resolvedEmail;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        // NFR10 — recorded via a security-definer RPC since there's no
        // session yet to write through normal RLS-gated tables.
        await supabase.rpc("log_failed_login", { p_email: email, p_detail: "invalid credentials" });
        setError(GENERIC_ERROR);
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

      const redirectTo = searchParams.get("redirectTo") || "/dashboard";
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
        <Link href="/" className="mb-6 flex items-center justify-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-medical">
            <Activity size={22} className="text-white" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-navy">Capital Radiology</p>
            <p className="text-[11px] text-slate-500">Online MRI portal</p>
          </div>
        </Link>

        <div className="card p-6 sm:p-7">
          <h1 className="text-lg font-bold text-navy">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Use your email or username and password to access your account.</p>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="identifier" className="mb-1 block text-xs font-semibold text-slate-600">
                Email or username
              </label>
              <input
                id="identifier"
                type="text"
                required
                autoComplete="username"
                className="input w-full"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
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
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className="input w-full pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                </button>
              </div>
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

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="flex w-full items-center justify-center gap-2.5 rounded-md border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <GoogleIcon />
            {googleLoading ? "Redirecting…" : "Continue with Google"}
          </button>

          <p className="mt-5 text-center text-sm text-slate-500">
            New patient?{" "}
            <a href="/signup" className="font-semibold text-medical hover:underline">
              Create an account
            </a>
          </p>
          <p className="mt-2 text-center text-sm text-slate-500">
            Referring doctor without an account?{" "}
            <a href="/request-doctor-access" className="font-semibold text-medical hover:underline">
              Request access
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.9 6 29.7 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.9 6 29.7 4 24 4c-7.6 0-14.1 4.3-17.7 10.7z" />
      <path fill="#4CAF50" d="M24 44c5.6 0 10.7-2.1 14.5-5.6l-6.7-5.7C29.7 34.7 27 35.7 24 35.7c-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.8 39.6 16.3 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.7 5.7C41.9 36 44 30.6 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}
