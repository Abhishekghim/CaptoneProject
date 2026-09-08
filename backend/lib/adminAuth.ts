import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/backend/lib/supabase/server";

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

  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
    return { error: NextResponse.json({ error: "Admin access required." }, { status: 403 }) } as const;
  }

  return { supabase, admin: profile as { id: string; role: "admin" | "super_admin"; full_name: string } } as const;
}

/**
 * Stricter guard for super_admin-only routes — account creation, role
 * changes, and referring-doctor approval all provision or reassign real
 * system access, which backend/database/008_super_admin.sql deliberately reserves
 * for super_admin, not regular admin (separation of duties).
 */
export async function requireSuperAdmin() {
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

  if (!profile || profile.role !== "super_admin") {
    return { error: NextResponse.json({ error: "Super admin access required." }, { status: 403 }) } as const;
  }

  return { supabase, admin: profile as { id: string; role: "super_admin"; full_name: string } } as const;
}
