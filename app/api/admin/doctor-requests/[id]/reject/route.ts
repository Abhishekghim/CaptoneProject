import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/backend/lib/adminAuth";

// Rejecting never touches Auth — no account was ever created for a pending
// request, so this only needs to update the queue row (RLS on
// referring_doctor_requests restricts that update to super_admin — see
// backend/database/008_super_admin.sql; this route additionally requires a reason
// so there's always a record of why).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;
  const { supabase, admin } = auth;

  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const reason = body.reason?.trim();
  if (!reason) {
    return NextResponse.json({ error: "A rejection reason is required." }, { status: 400 });
  }

  const { data: doctorRequest, error: fetchError } = await supabase
    .from("referring_doctor_requests")
    .select("id, status")
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

  const { error: updateError, data: updated } = await supabase
    .from("referring_doctor_requests")
    .update({
      status: "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq("id", doctorRequest.id)
    .eq("status", "pending")
    .select("id")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "This request was already processed." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
