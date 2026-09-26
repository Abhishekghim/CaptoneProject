import "server-only";
import { createAdminClient } from "@/backend/lib/supabase/admin";
import { sendEmail } from "@/backend/lib/notifications/email";

export interface SendNotificationParams {
  userId: string;
  type: string;
  subject: string;
  emailHtml?: string;
  appointmentId?: string | null;
}

export interface SendNotificationResult {
  email?: { ok: boolean; error?: string };
}

/**
 * Orchestrator other phases' API routes call after a DB write (e.g. booking
 * confirmed, report finalized, appointment reminder) to notify a user by
 * email. Uses the service-role client because it needs to read another
 * user's contact info (profiles.email) — RLS wouldn't let an arbitrary
 * authenticated caller read someone else's profile row, and this function is
 * meant to be called from trusted server-side route handlers after their own
 * authorization checks have already passed.
 *
 * TODO(phase-3-or-later): once communication_log + notification_preferences
 * tables exist, gate sends on preferences (appointment_reminders,
 * report_ready_alerts, billing_alerts, email_enabled — see shared/types.ts
 * NotificationPreferences) and persist each attempt there instead of console
 * logging.
 */
export async function sendNotification(params: SendNotificationParams): Promise<SendNotificationResult> {
  const { userId, type, subject, emailHtml, appointmentId } = params;

  const result: SendNotificationResult = {};

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    const error = profileError?.message ?? "Recipient profile not found";
    console.warn("[notifications/send]", JSON.stringify({ userId, type, channel: "lookup", ok: false, error }));
    return result;
  }

  if (emailHtml && profile.email) {
    try {
      const emailResult = await sendEmail({ to: profile.email, subject, html: emailHtml });
      result.email = emailResult;
      console.log(
        "[notifications/send]",
        JSON.stringify({ userId, type, appointmentId: appointmentId ?? null, channel: "email", ...emailResult })
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      result.email = { ok: false, error };
      console.warn(
        "[notifications/send]",
        JSON.stringify({ userId, type, appointmentId: appointmentId ?? null, channel: "email", ok: false, error })
      );
    }
  }

  return result;
}
