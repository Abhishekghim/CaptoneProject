import { NextResponse } from "next/server";
import { requireUser } from "@/backend/lib/adminAuth";
import { createAdminClient } from "@/backend/lib/supabase/admin";

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

// Test-mode phone "verification" — bypasses the real Vonage/Twilio SMS OTP
// entirely. Exists because Vonage is still in trial/demo mode (slow,
// watermarked delivery) and was blocking booking-flow testing outright; see
// the phone OTP debugging earlier in this project's history. Off by
// default and completely inert unless PHONE_VERIFICATION_TEST_MODE=true is
// explicitly set in .env.local — never set that in a real deployment.
//
// Uses the Admin API's phone_confirm flag to set a REAL phone_confirmed_at
// on the user (not a fake client-side flag), so the rest of the app
// (BookingCard's `Boolean(data.user?.phone_confirmed_at)` check) treats it
// identically to a genuinely-verified number and never re-prompts.
export async function POST(request: Request) {
  if (process.env.PHONE_VERIFICATION_TEST_MODE !== "true") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";

  if (!PHONE_PATTERN.test(phone)) {
    return NextResponse.json({ error: "Enter a valid phone number in international format." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error: adminError } = await admin.auth.admin.updateUserById(auth.user.id, {
    phone,
    phone_confirm: true,
  });
  if (adminError) {
    return NextResponse.json({ error: adminError.message }, { status: 500 });
  }

  const { error: profileError } = await admin.from("profiles").update({ phone }).eq("id", auth.user.id);
  if (profileError) {
    console.warn("[dev/verify-phone-test] could not sync phone to profiles:", profileError.message);
  }

  return NextResponse.json({ ok: true });
}
