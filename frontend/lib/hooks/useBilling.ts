"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/frontend/lib/supabase/client";
import type { Billing } from "@/shared/types";

// Real `billing` read — staff-wide via `is_staff()` RLS. null = still
// loading, [] = loaded and empty. Each caller gets its own independent
// fetch (no shared cache/context).
export function useBilling() {
  const [data, setData] = useState<Billing[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: rows, error } = await supabase.from("billing").select("*");
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setData((rows ?? []) as Billing[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loadError, reload: load };
}
