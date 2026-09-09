import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/backend/lib/adminAuth";
import { createAdminClient } from "@/backend/lib/supabase/admin";

// NFR36 — patients can request deletion from their dashboard (a plain
// update to profiles.deletion_requested_at, allowed by the existing
// profiles_update_own policy). Executing the deletion itself is
// deliberately a separate, admin-only, service-role step rather than
// instant self-service: health records often carry retention obligations
// an operator needs to sign off on, and an accidental self-delete of a
// medical record is not something to make one click away.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: profile, error: fetchError } = await supabase
    .from("profiles")
    .select("id, email, deletion_requested_at")
    .eq("id", params.id)
    .single();

  if (fetchError || !profile) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  if (!profile.deletion_requested_at) {
    return NextResponse.json({ error: "This account has no pending deletion request." }, { status: 409 });
  }

  // auth.users -> profiles is `on delete cascade` (backend/database/schema.sql),
  // which cascades further into patient_medical_records, appointments, etc.
  // — deleting the auth user is the single real removal step.
  const adminClient = createAdminClient();
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(params.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || "Could not delete this account." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
