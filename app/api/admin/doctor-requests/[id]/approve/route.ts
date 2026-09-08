import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";

// Approving a referring-doctor request is the ONLY code path that ever
// creates a referring_doctor auth account. Internal roles (technician /
// radiologist / admin) are still provisioned directly by an admin via
// supabase.auth.admin.inviteUserByEmail or the Supabase dashboard — see the
// note in app/signup/page.tsx. A referring doctor is external, so instead of
// an admin needing to know every GP in Sydney ahead of time, they review a
// request that the doctor submitted themselves (app/request-doctor-access)
// and this route is what turns an approved request into a real account.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase, admin } = auth;

  const { data: doctorRequest, error: fetchError } = await supabase
    .from("referring_doctor_requests")
    .select("id, full_name, email, practice_name, ahpra_number, status")
    .eq("id", params.id)
    .single();

  if (fetchError || !doctorRequest) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if (doctorRequest.status !== "pending") {
    return NextResponse.json(
      { error: `This request was already ${doctorRequest.status} — refresh the queue.` },
      { status: 409 }
    );
  }

  // Service-role call: creates the auth.users row and emails the doctor an
  // invite link to set their password. `handle_new_user` (database/schema.sql)
  // reads `role` out of this metadata and sets profiles.role accordingly —
  // the same trigger every other signup path already goes through, so this
  // is not a second, parallel way of granting roles.
  const adminClient = createAdminClient();
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    doctorRequest.email,
    { data: { full_name: doctorRequest.full_name, role: "referring_doctor" } }
  );

  if (inviteError || !invited?.user) {
    const message = inviteError?.message?.toLowerCase().includes("already been registered")
      ? "A user with this email already has an account — approve manually or have them use password reset."
      : inviteError?.message || "Could not create the doctor's account.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // `.eq("status", "pending")` again here guards against two admins approving
  // the same request in a race; whichever update loses the race affects 0
  // rows rather than double-processing it.
  const { error: updateError, data: updated } = await supabase
    .from("referring_doctor_requests")
    .update({
      status: "approved",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      created_profile_id: invited.user.id,
    })
    .eq("id", doctorRequest.id)
    .eq("status", "pending")
    .select("id")
    .single();

  if (updateError || !updated) {
    // The auth account now exists even though this update failed or lost a
    // race — surface that loudly instead of leaving an orphaned account with
    // no linked request.
    return NextResponse.json(
      {
        error: `Doctor account for ${doctorRequest.email} was created, but the request record could not be updated (${
          updateError?.message ?? "already processed"
        }). Check profiles/referring_doctor_requests directly.`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, profileId: invited.user.id });
}
