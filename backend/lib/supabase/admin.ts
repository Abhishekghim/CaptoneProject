import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS entirely and can call the Auth
 * Admin API (e.g. `auth.admin.inviteUserByEmail`). NEVER import this from a
 * "use client" component or anything that ships to the browser — the
 * `server-only` import above makes that a build error, not just a
 * convention. Use it only from Route Handlers that have already verified
 * the caller is an authenticated admin (see
 * app/api/admin/doctor-requests/[id]/approve/route.ts for the pattern).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client is not configured. Set SUPABASE_SERVICE_ROLE_KEY (Project Settings -> API -> service_role) in .env.local — see .env.local.example. Never expose this key to the browser."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
