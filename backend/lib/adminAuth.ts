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

/**
 * Guard for Route Handlers that just need "any signed-in user," regardless
 * of role — e.g. the notification-send endpoint, which any authenticated
 * caller (patient or staff) may trigger about an action they just performed
 * (their own booking confirmation, a staff member recording a payment,
 * etc). Same re-validate-against-Supabase-Auth pattern as the other guards,
 * without a role check.
 */
export async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) } as const;
  }

  return { supabase, user } as const;
}

/**
 * Guard for staff-only Route Handlers (e.g. reception/technician/radiologist
 * shared endpoints). Mirrors is_staff() in backend/database/010_reception_role.sql:
 * technician, radiologist, admin, super_admin, and reception all count as
 * staff. Same re-validate-against-Supabase-Auth pattern as requireAdmin/
 * requireSuperAdmin above.
 */
export async function requireStaff() {
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

  const STAFF_ROLES = ["technician", "radiologist", "admin", "super_admin", "reception"] as const;

  if (!profile || !STAFF_ROLES.includes(profile.role as (typeof STAFF_ROLES)[number])) {
    return { error: NextResponse.json({ error: "Staff access required." }, { status: 403 }) } as const;
  }

  return {
    supabase,
    admin: profile as { id: string; role: (typeof STAFF_ROLES)[number]; full_name: string },
  } as const;
}
