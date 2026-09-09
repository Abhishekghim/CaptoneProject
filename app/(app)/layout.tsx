import React from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/backend/lib/supabase/server";
import { StoreProvider } from "@/frontend/lib/store";
import Shell from "@/frontend/components/shared/Shell";
import type { Profile } from "@/shared/types";

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
    .select("id, email, full_name, role, phone, username, created_at, is_active")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  // A super_admin can deactivate a staff account (backend/database/008_super_admin.sql)
  // — this is what actually makes that mean something, rather than just
  // being a flag nobody reads. Checked on every protected page load, so an
  // already-active session gets cut off too, not just a fresh sign-in.
  if (!profile.is_active) {
    await supabase.auth.signOut();
    redirect("/login?reason=deactivated");
  }

  return (
    <StoreProvider profile={profile as Profile}>
      <Shell>{children}</Shell>
    </StoreProvider>
  );
}
