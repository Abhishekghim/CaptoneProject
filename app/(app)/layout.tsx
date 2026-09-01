"use client";

// TEMPORARY: local-only auth guard (no Supabase). The real, working
// server-side version of this file — which checks the session and role via
// Supabase and belongs here once a backend is connected — is saved at
// lib/supabase/app-layout.server-reference.tsx.

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/SessionContext";
import { StoreProvider } from "@/lib/store";
import Shell from "@/components/shared/Shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session) router.replace("/login");
  }, [session, router]);

  if (!session) return null;

  return (
    <StoreProvider profile={session}>
      <Shell>{children}</Shell>
    </StoreProvider>
  );
}
