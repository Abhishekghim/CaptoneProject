"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Session is persisted in cookies (not localStorage)
 * via @supabase/ssr so middleware and Server Components can read the same
 * session that the browser holds.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local — see .env.local.example."
    );
  }

  return createBrowserClient(url, key);
}
