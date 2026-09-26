"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { BODY_PARTS } from "@/frontend/lib/constants";
import { createClient } from "@/frontend/lib/supabase/client";
import type { ContentPageId } from "@/shared/types";

/* ------------------------------------------------------------------ */
/* Clinic info (FR75-77, admin-editable via ContentManagementPanel)    */
/* ------------------------------------------------------------------ */
// Reads real Supabase data (backend/database/011_cms_content.sql) instead of
// the mock store's contentPages/prepInstructions/announcements — see
// frontend/components/admin/ContentManagementPanel.tsx, which writes these
// same tables.
type ClinicContentPageRow = { id: ContentPageId; title: string; body: string; updated_at: string; updated_by: string | null };
type ClinicPrepInstructionRow = { body_part: string; instructions: string; updated_at: string };

export default function ClinicInfoTabs() {
  const [tab, setTab] = useState<"about" | "contact" | "faq" | "prep">("about");
  const [prepBodyPart, setPrepBodyPart] = useState(BODY_PARTS[0]);

  const [pages, setPages] = useState<ClinicContentPageRow[] | null>(null);
  const [prepInstructions, setPrepInstructions] = useState<ClinicPrepInstructionRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [pagesRes, prepRes] = await Promise.all([
        supabase.from("content_pages").select("id, title, body, updated_at, updated_by"),
        supabase.from("prep_instructions").select("body_part, instructions, updated_at"),
      ]);
      if (cancelled) return;
      if (pagesRes.error || prepRes.error) {
        setLoadError(pagesRes.error?.message || prepRes.error?.message || "Could not load content.");
        return;
      }
      setLoadError(null);
      setPages((pagesRes.data ?? []) as ClinicContentPageRow[]);
      setPrepInstructions((prepRes.data ?? []) as ClinicPrepInstructionRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const page = tab !== "prep" ? (pages ?? []).find((p) => p.id === tab) ?? null : null;
  const prep = (prepInstructions ?? []).find((p) => p.body_part === prepBodyPart) ?? null;
  const loading = !pages || !prepInstructions;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["about", "contact", "faq", "prep"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${
              tab === t ? "bg-medical text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t === "prep" ? "MRI prep" : t}
          </button>
        ))}
      </div>

      {loadError ? (
        <p role="alert" className="text-sm text-rose-700">Could not load content: {loadError}</p>
      ) : loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : tab === "prep" ? (
        <div>
          <select className="input mb-3 w-48" value={prepBodyPart} onChange={(e) => setPrepBodyPart(e.target.value)}>
            {BODY_PARTS.map((b) => <option key={b}>{b}</option>)}
          </select>
          <p className="whitespace-pre-wrap text-sm text-slate-700">
            {prep?.instructions || "No special preparation needed for this scan — just arrive a few minutes early."}
          </p>
        </div>
      ) : (
        page && <p className="whitespace-pre-wrap text-sm text-slate-700">{page.body}</p>
      )}
    </div>
  );
}
