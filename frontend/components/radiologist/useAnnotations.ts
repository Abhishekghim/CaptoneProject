"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/frontend/lib/store";
import { createClient } from "@/frontend/lib/supabase/client";
import type { ImageAnnotation } from "@/shared/types";

// Real image_annotations, scoped to whichever scan is currently open in the
// viewer (RLS: staff read/write any row — image_annotations_staff_write).
// null = still loading; [] = loaded, no annotations yet.
export function useAnnotations(scanId: string | null) {
  const store = useStore();
  const [annotations, setAnnotations] = useState<ImageAnnotation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!scanId) {
      setAnnotations([]);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("image_annotations")
      .select("*")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: true });
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setAnnotations((data ?? []) as ImageAnnotation[]);
  }, [scanId]);

  useEffect(() => {
    load();
  }, [load]);

  const addAnnotation = useCallback(
    async (x: number, y: number, note: string) => {
      if (!scanId) return;
      setActionError(null);
      const supabase = createClient();
      const { error } = await supabase
        .from("image_annotations")
        .insert({ scan_id: scanId, author_id: store.currentUser.id, x, y, note });
      if (error) {
        setActionError(error.message);
        return;
      }
      load();
    },
    [scanId, store.currentUser.id, load]
  );

  const removeAnnotation = useCallback(
    async (id: string) => {
      setActionError(null);
      const supabase = createClient();
      const { error } = await supabase.from("image_annotations").delete().eq("id", id);
      if (error) {
        setActionError(error.message);
        return;
      }
      load();
    },
    [load]
  );

  return { annotations, loadError, actionError, addAnnotation, removeAnnotation };
}
