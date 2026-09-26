import { NextResponse } from "next/server";
import { createClient } from "@/backend/lib/supabase/server";

// OAuth (Google) redirect target. Exchanges the one-time `code` for a real
// session (writing the session cookies, which a Route Handler — unlike a
// Server Component — is allowed to do), then forwards the caller on.
//
// `consent=true` is only ever appended by app/signup/page.tsx's Google
// button, and only after the same consent checkbox the email/password form
// requires is checked. handle_new_user (backend/database/007_consent_deletion_security.sql)
// stamps profiles.consent_given_at from signup metadata for email/password
// accounts, but Supabase OAuth provides no equivalent hook to inject custom
// metadata into an identity token — so for Google sign-ups, this route
// stamps it directly, once, right after the account exists. The `is(...,
// null)` guard makes this idempotent: a returning Google user hitting
// /login (no consent param) never touches the column, and a signup retry
// can't stomp an already-recorded timestamp.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";
  const consent = searchParams.get("consent") === "true";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      if (consent) {
        await supabase
          .from("profiles")
          .update({ consent_given_at: new Date().toISOString() })
          .eq("id", data.user.id)
          .is("consent_given_at", null);
      }
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
