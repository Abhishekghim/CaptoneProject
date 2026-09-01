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
    .select("id, email, full_name, role, phone, username, created_at")
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
