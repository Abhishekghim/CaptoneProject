import "server-only";

/**
 * Thin wrapper around the Resend email API. Lazily imports/instantiates the
 * Resend client only when RESEND_API_KEY is actually set, so this module is
 * safe to import even in environments (local dev, CI) where no email
 * provider is configured — it just no-ops with a clear error string instead
 * of throwing. Callers (see send.ts) should never need to wrap this in a
 * try/catch of their own; any failure is reported via the return value.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { ok: false, error: "Email provider not configured (RESEND_API_KEY missing)" };
  }

  let from = process.env.NOTIFICATIONS_FROM_EMAIL;
  if (!from) {
    console.warn(
      "[notifications/email] NOTIFICATIONS_FROM_EMAIL is not set — falling back to a placeholder sender address."
    );
    from = "Capital Radiology <notifications@capitalradiology.example>";
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({ from, to, subject, html });

    if (error) {
      return { ok: false, error: error.message ?? String(error) };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
