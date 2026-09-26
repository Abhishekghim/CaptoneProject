"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, UserPlus, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

// Patients only. There is deliberately no role field anywhere on this page —
// role is never chosen by the user, on this form or any other.
//
// Staff accounts (technician, radiologist, admin) are NOT self-registerable
// here or anywhere else in the app. Create them via an admin invite flow
// (e.g. supabase.auth.admin.inviteUserByEmail from a trusted server context)
// or directly in the Supabase dashboard, then set profiles.role explicitly.
// Do not add a public signup path for staff roles.
export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Google sign-up needs no username/password step, but the health-data
  // consent checkbox is required regardless of how the account is created —
  // gate the button on it rather than skipping consent for this path.
  async function handleGoogleSignUp() {
    if (!consent) {
      setError("Please confirm you consent to the collection and storage of your health data to continue.");
      return;
    }
    setError(null);
    setGoogleLoading(true);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent("/dashboard")}&consent=true`,
      },
    });
    if (oauthError) {
      setError(oauthError.message || "Could not start Google sign-up. Please try again.");
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedUsername = username.trim();
    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      setError("Username must be 3-24 characters: letters, numbers, and underscores only.");
      return;
    }
    if (!consent) {
      setError("Please confirm you consent to the collection and storage of your health data to continue.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();

      // Pre-check for a clean inline error. The database also enforces this
      // (a case-insensitive unique index — see backend/database/002_usernames.sql),
      // so a race between two people signing up with the same username at
      // the same instant still can't create a duplicate; it would just
      // surface as a less friendly error from signUp() below instead.
      const { data: available, error: availabilityError } = await supabase.rpc("is_username_available", {
        p_username: trimmedUsername,
      });
      if (availabilityError) {
        setError("Could not verify username availability. Please try again.");
        return;
      }
      if (!available) {
        setError("That username is already taken.");
        return;
      }

      // full_name and username are passed as auth user metadata; the
      // `handle_new_user` trigger in backend/database/002_usernames.sql reads them
      // when it creates the matching `profiles` row. That trigger is what
      // actually inserts the profile (as a security-definer function,
      // bypassing RLS) and it hardcodes role to 'patient' via
      //   coalesce((raw_user_meta_data ->> 'role')::user_role, 'patient')
      // — since we never send a `role` key in the metadata below, every
      // self-service signup is forced to 'patient' server-side.
      //
      // We intentionally do NOT also insert into `profiles` from this
      // page: there is no RLS policy letting a newly authenticated user
      // insert their own profile row (see backend/database/schema.sql — only the
      // trigger and admins can write to `profiles`), so a client-side
      // insert here would just fail. That's correct: it means role
      // assignment can't be forged by tampering with a client request.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        // `consent` flows into handle_new_user (backend/database/007_consent_deletion_security.sql),
        // which stamps profiles.consent_given_at at creation time — capturing
        // it here rather than via a later client update means it's recorded
        // even when email confirmation delays the first real session.
        options: { data: { full_name: fullName, username: trimmedUsername, consent: true } },
      });

      if (signUpError) {
        setError(signUpError.message || "Could not create your account. Please try again.");
        return;
      }

      if (data.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        // Email confirmation is required before a session exists.
        setNotice("Account created. Check your email to confirm your address, then sign in.");
      }
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
          <h1 className="text-lg font-bold text-navy">Create a patient account</h1>
          <p className="mt-1 text-sm text-slate-500">
            For staff accounts, contact an administrator — this form is for patients only.
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
              <label htmlFor="username" className="mb-1 block text-xs font-semibold text-slate-600">
                Username
              </label>
              <input
                id="username"
                type="text"
                required
                autoComplete="username"
                pattern="[a-zA-Z0-9_]{3,24}"
                title="3-24 characters: letters, numbers, and underscores only"
                className="input w-full"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-slate-400">
                You can sign in with this username instead of your email. Letters, numbers, underscores only.
              </p>
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
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
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

            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-medical focus:ring-medical"
              />
              <span>
                I consent to Capital Radiology collecting and storing my health information to provide MRI booking,
                imaging, and reporting services, per the{" "}
                <a href="/privacy" target="_blank" className="font-semibold text-medical hover:underline">Privacy Policy</a>{" "}
                and{" "}
                <a href="/terms" target="_blank" className="font-semibold text-medical hover:underline">Terms of Service</a>.
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {notice}
              </p>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-2.5">
              <UserPlus size={16} aria-hidden />
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={googleLoading}
            title={!consent ? "Check the consent box above first" : undefined}
            className="flex w-full items-center justify-center gap-2.5 rounded-md border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <GoogleIcon />
            {googleLoading ? "Redirecting…" : "Continue with Google"}
          </button>

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
