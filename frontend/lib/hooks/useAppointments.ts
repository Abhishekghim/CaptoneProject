"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/frontend/lib/supabase/client";
import type { Appointment } from "@/shared/types";

// Real `appointments` read — any staff role can read broadly via the
// `is_staff()` RLS policy. null = still loading, [] = loaded and empty.
// Each caller gets its own independent fetch (no shared cache/context —
// see the other hooks in this directory for the same convention).
export function useAppointments() {
  const [data, setData] = useState<Appointment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: rows, error } = await supabase.from("appointments").select("*");
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setData((rows ?? []) as Appointment[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loadError, reload: load };
}
