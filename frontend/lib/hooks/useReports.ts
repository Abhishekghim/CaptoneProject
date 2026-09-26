"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/frontend/lib/supabase/client";
import type { RadiologyReport } from "@/shared/types";

// Real `radiology_reports` read — staff-wide via `is_staff()` RLS. null =
// still loading, [] = loaded and empty. Each caller gets its own
// independent fetch (no shared cache/context).
export function useReports() {
  const [data, setData] = useState<RadiologyReport[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: rows, error } = await supabase.from("radiology_reports").select("*");
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setData((rows ?? []) as RadiologyReport[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loadError, reload: load };
}
