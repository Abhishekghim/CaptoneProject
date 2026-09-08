import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared guard for admin-only Route Handlers (e.g. the doctor-request
 * approve/reject endpoints). Re-validates the session server-side against
 * Supabase Auth and looks the caller's role up from `profiles` — the same
 * defense-in-depth pattern as app/(app)/layout.tsx, applied to API routes,
 * which middleware.ts deliberately lets through unauthenticated (see its
 * comment on `/api/` paths) so each route must enforce this itself.
 */
export async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) } as const;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return { error: NextResponse.json({ error: "Admin access required." }, { status: 403 }) } as const;
  }

  return { supabase, admin: profile as { id: string; role: "admin"; full_name: string } } as const;
}
