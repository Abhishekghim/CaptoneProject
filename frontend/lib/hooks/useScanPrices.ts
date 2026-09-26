"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/frontend/lib/supabase/client";

// Real `scan_prices` read — any authenticated user can read (RLS:
// `scan_prices_read_any_authed`, see backend/database/011_cms_content.sql),
// since patients need pricing visible when booking. Pre-shaped as a
// body_part -> price map, matching how the mock's `store.scanPrices` was
// shaped (consumers do `prices[bodyPart] ?? 480`). null = still loading,
// {} = loaded and empty. Each caller gets its own independent fetch (no
// shared cache/context — same convention as the other hooks in this
// directory).
export function useScanPrices() {
  const [data, setData] = useState<Record<string, number> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: rows, error } = await supabase.from("scan_prices").select("body_part, price");
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    const map: Record<string, number> = {};
    for (const row of (rows ?? []) as { body_part: string; price: number }[]) {
      map[row.body_part] = row.price;
    }
    setData(map);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loadError, reload: load };
}
