"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedUsername = username.trim();
    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      setError("Username must be 3-24 characters: letters, numbers, and underscores only.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();

      // Pre-check for a clean inline error. The database also enforces this
      // (a case-insensitive unique index — see database/002_usernames.sql),
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
      // `handle_new_user` trigger in database/002_usernames.sql reads them
      // when it creates the matching `profiles` row. That trigger is what
      // actually inserts the profile (as a security-definer function,
      // bypassing RLS) and it hardcodes role to 'patient' via
      //   coalesce((raw_user_meta_data ->> 'role')::user_role, 'patient')
      // — since we never send a `role` key in the metadata below, every
      // self-service signup is forced to 'patient' server-side.
      //
      // We intentionally do NOT also insert into `profiles` from this
      // page: there is no RLS policy letting a newly authenticated user
      // insert their own profile row (see database/schema.sql — only the
      // trigger and admins can write to `profiles`), so a client-side
      // insert here would just fail. That's correct: it means role
      // assignment can't be forged by tampering with a client request.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, username: trimmedUsername } },
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
              <input
                id="password"
                type="password"
                required
                minLength={8}
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
