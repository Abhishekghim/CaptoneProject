import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/backend/lib/adminAuth";
import { sendNotification } from "@/backend/lib/notifications/send";

/**
 * Thin authenticated wrapper around backend/lib/notifications/send.ts, which
 * is server-only (uses the service-role client to read an arbitrary
 * recipient's contact info) and so can't be called directly from client
 * components. Any signed-in user may call this — it's used right after a
 * client-side write (booking, payment, insurance resolution, etc.) succeeds,
 * to notify whichever user the action concerns (often, but not always, the
 * caller themselves — e.g. reception recording a payment notifies the
 * patient, not reception). This is not a generic messaging endpoint: the
 * caller only supplies *what* to send, never bypasses recipient lookup, and
 * the underlying sendNotification() never throws, so this route always
 * responds 200 with per-channel results rather than failing the caller's
 * larger action over a notification-send hiccup.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  let body: {
    userId?: string;
    type?: string;
    subject?: string;
    emailHtml?: string;
    appointmentId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { userId, type, subject, emailHtml, appointmentId } = body ?? {};

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  if (!type || typeof type !== "string") {
    return NextResponse.json({ error: "type is required." }, { status: 400 });
  }
  if (!subject || typeof subject !== "string") {
    return NextResponse.json({ error: "subject is required." }, { status: 400 });
  }
  if (!emailHtml) {
    return NextResponse.json({ error: "emailHtml is required." }, { status: 400 });
  }

  const result = await sendNotification({
    userId,
    type,
    subject,
    emailHtml,
    appointmentId: appointmentId ?? null,
  });

  return NextResponse.json({ ok: true, result });
}
