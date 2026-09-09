import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/backend/lib/adminAuth";
import { createAdminClient } from "@/backend/lib/supabase/admin";

const CREATABLE_ROLES = ["technician", "radiologist", "admin", "super_admin", "referring_doctor"] as const;
type CreatableRole = (typeof CREATABLE_ROLES)[number];

// The only path (besides patient self-signup and the doctor-request queue)
// that creates a real account. Uses inviteUserByEmail exactly like the
// doctor-approval route: it emails the new hire a link to set their own
// password, rather than super_admin choosing one for them. handle_new_user
// (backend/database/schema.sql) reads `role` out of this metadata — the same
// trigger every signup path goes through, so this isn't a second, parallel
// way of granting roles.
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  let body: { email?: string; full_name?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim();
  const fullName = body.full_name?.trim();
  const role = body.role as CreatableRole | undefined;

  if (!email || !fullName) {
    return NextResponse.json({ error: "Email and full name are required." }, { status: 400 });
  }
  if (!role || !CREATABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role },
  });

  if (inviteError || !invited?.user) {
    const message = inviteError?.message?.toLowerCase().includes("already been registered")
      ? "A user with this email already has an account."
      : inviteError?.message || "Could not create this account.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, profileId: invited.user.id });
}
