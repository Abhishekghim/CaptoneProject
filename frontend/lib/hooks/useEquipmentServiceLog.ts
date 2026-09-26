"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/frontend/lib/supabase/client";
import type { EquipmentServiceRecord } from "@/shared/types";

// Real `equipment_service_log` read (equipment_service_log_staff_read
// RLS). null = still loading, [] = loaded and empty. Each caller gets its
// own independent fetch (no shared cache/context) — moved here from
// AdminDashboard.tsx's former inline EquipmentServiceLog fetch effect so
// ReportsPanel.tsx (and future dashboards) can reuse it.
export function useEquipmentServiceLog() {
  const [data, setData] = useState<EquipmentServiceRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: rows, error } = await supabase
      .from("equipment_service_log")
      .select("*")
      .order("performed_at", { ascending: false });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setData((rows ?? []) as EquipmentServiceRecord[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loadError, reload: load };
}
