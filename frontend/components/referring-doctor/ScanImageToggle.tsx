"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/frontend/lib/supabase/client";
import DicomViewer from "@/frontend/components/radiologist/DicomViewer";
import type { ImageAnnotation, MriScan } from "@/shared/types";

// View-only real image_annotations read, scoped to this one scan
// (image_annotations_read RLS already lets a patient's referring doctor's
// staff-equivalent access aside — this is gated one level up by
// isInternal, matching the DICOM release policy comment in hooks.ts).
export default function ScanImageToggle({ scan }: { scan: MriScan }) {
  const [showImage, setShowImage] = useState(false);
  const [annotations, setAnnotations] = useState<ImageAnnotation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("image_annotations")
        .select("*")
        .eq("scan_id", scan.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        return;
      }
      setLoadError(null);
      setAnnotations((data ?? []) as ImageAnnotation[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [scan.id]);

  return (
    <div className="mt-2">
      <button type="button" className="btn-ghost text-xs" onClick={() => setShowImage((v) => !v)}>
        {showImage ? "Hide scan image" : "View scan image"}
      </button>
      {loadError && <p className="mt-1 text-xs font-semibold text-rose-700">Could not load annotations: {loadError}</p>}
      {showImage && (
        <div className="mt-2">
          <DicomViewer
            scanId={scan.id}
            bodyPart={scan.body_part}
            meta={{ protocol: scan.protocol, machine: scan.machine_name ?? undefined, performedAt: scan.performed_at ?? undefined }}
            annotations={annotations ?? []}
            canAnnotate={false}
          />
        </div>
      )}
    </div>
  );
}
