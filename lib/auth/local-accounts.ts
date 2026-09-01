import { SEED_PROFILES } from "@/lib/seed";
import { DEMO_CREDENTIALS } from "./demo-credentials";
import type { Profile } from "@/lib/types";

// ----------------------------------------------------------------------------
// TEMPORARY local-only auth for frontend development without a Supabase
// backend. No network calls, nothing persisted — everything here lives in
// browser memory and resets on a full page reload.
//
// A real, working Supabase implementation already exists and is untouched:
// lib/supabase/client.ts, lib/supabase/server.ts, middleware.ts, and the
// original signIn/signUp logic. To go live, swap the calls in
// app/login/page.tsx and app/signup/page.tsx (and app/(app)/layout.tsx) from
// this module back to those — see the comments in each of those files.
// ----------------------------------------------------------------------------

interface LocalAccount {
  email: string;
  password: string;
  profile: Profile;
}

function demoProfile(id: string): Profile {
  const p = SEED_PROFILES.find((sp) => sp.id === id);
  if (!p) throw new Error(`Seed profile ${id} not found`);
  return p;
}

export { DEMO_CREDENTIALS };

// One mutable account list, seeded from the premade demo logins plus
// whatever gets signed up locally. Module-level array, not localStorage or
// any other durable storage — a full page reload wipes it back to just the
// premade accounts, by design.
let accounts: LocalAccount[] = DEMO_CREDENTIALS.map((c) => ({
  email: c.email,
  password: c.password,
  profile: demoProfile(c.profileId),
}));

let nextId = 1;

function findIndexByEmail(email: string): number {
  const normalized = email.trim().toLowerCase();
  return accounts.findIndex((a) => a.email.toLowerCase() === normalized);
}

export function findAccount(email: string, password: string): Profile | null {
  const idx = findIndexByEmail(email);
  if (idx === -1) return null;
  return accounts[idx].password === password ? accounts[idx].profile : null;
}

export function accountExists(email: string): boolean {
  return findIndexByEmail(email) !== -1;
}

// Signup is patient-only: role is hardcoded here, never taken from a
// parameter, so there is no way for a caller to request another role.
export function createPatientAccount(
  email: string,
  password: string,
  fullName: string
): { ok: true; profile: Profile } | { ok: false; error: string } {
  if (accountExists(email)) {
    return { ok: false, error: "An account with that email already exists." };
  }

  const profile: Profile = {
    id: `local-${nextId++}-${Date.now().toString(36)}`,
    email: email.trim(),
    full_name: fullName.trim(),
    role: "patient",
    created_at: new Date().toISOString(),
  };
  accounts = [...accounts, { email: email.trim(), password, profile }];
  return { ok: true, profile };
}

// Local-demo password reset: there's no email service wired up (no backend
// yet — see the module comment above), so this can't send a reset link. It
// verifies the email belongs to a real account and sets the new password
// immediately. The login page and forgot-password page both say so plainly
// rather than pretending an email went out.
export function resetPassword(
  email: string,
  newPassword: string
): { ok: true } | { ok: false; error: string } {
  const idx = findIndexByEmail(email);
  if (idx === -1) {
    return { ok: false, error: "No account found with that email." };
  }
  accounts = accounts.map((a, i) => (i === idx ? { ...a, password: newPassword } : a));
  return { ok: true };
}
