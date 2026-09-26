"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/frontend/lib/supabase/client";
import type { EquipmentLog } from "@/shared/types";

// Real `equipment_logs` read (equipment_staff_read RLS — any staff can
// read; only admin can write). null = still loading, [] = loaded and
// empty. Each caller gets its own independent fetch (no shared
// cache/context) — moved here from AdminDashboard.tsx's former inline
// useEquipment() so ReportsPanel.tsx (and future dashboards) can reuse it.
export function useEquipment() {
  const [data, setData] = useState<EquipmentLog[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: rows, error } = await supabase
      .from("equipment_logs")
      .select("*")
      .order("machine_name", { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setData((rows ?? []) as EquipmentLog[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loadError, reload: load };
}
