// REFERENCE ONLY — not a route file (lives outside app/, so Next.js ignores it).
//
// This is the real, working Supabase version of app/(app)/layout.tsx, saved
// here while the app runs on temporary local-only auth (see
// lib/auth/local-accounts.ts and lib/auth/SessionContext.tsx). To go live
// with a real Supabase backend:
//   1. Copy this file's contents back into app/(app)/layout.tsx
//   2. Swap app/login/page.tsx and app/signup/page.tsx back to calling
//      supabase.auth.signInWithPassword / signUp (see git-free backups
//      noted in the comments of those files)
//   3. Remove the SessionProvider wrapper in app/layout.tsx (or leave it —
//      it's harmless, just unused once Supabase cookies are the source of truth)
//
// middleware.ts and lib/supabase/client.ts / lib/supabase/server.ts were
// never touched and need no changes.

import React from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StoreProvider } from "@/lib/store";
import Shell from "@/components/shared/Shell";
import type { Profile } from "@/lib/types";

// Defense in depth alongside middleware.ts: this Server Component re-checks
// the session and looks up the caller's role from `profiles` itself, so a
// protected page never renders without a verified server-side identity.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, phone, created_at")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  return (
    <StoreProvider profile={profile as Profile}>
      <Shell>{children}</Shell>
    </StoreProvider>
  );
}
