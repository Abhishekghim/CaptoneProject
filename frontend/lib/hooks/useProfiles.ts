"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/frontend/lib/supabase/client";
import type { Role } from "@/shared/types";

// The real `profiles` table has an `is_active` column the mock Profile type
// (shared/types.ts) doesn't — same reason StaffDirectoryPanel.tsx defines
// its own StaffRow instead of forcing the stale mock type. Everything else
// lines up with Profile, so this is effectively Profile + is_active.
export interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  phone: string | null;
  username: string | null;
  is_active: boolean;
  created_at: string;
}

// Real `profiles` read — staff-wide via the `profiles_select_own_or_staff`
// RLS policy. null = still loading, [] = loaded and empty. Each caller gets
// its own independent fetch (no shared cache/context).
export function useProfiles() {
  const [data, setData] = useState<ProfileRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: rows, error } = await supabase.from("profiles").select("*");
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setData((rows ?? []) as ProfileRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loadError, reload: load };
}
