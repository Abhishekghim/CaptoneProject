"use client";

import React, { useCallback, useEffect, useState } from "react";
import { FileSignature, Loader2, PenLine, Save, ShieldCheck } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { createClient } from "@/frontend/lib/supabase/client";
import { notifyPatient } from "@/frontend/lib/notify";
import type { RadiologyReport } from "@/shared/types";

// Real radiology_reports row for whichever scan is open in the editor (RLS:
// reports_radiologist_write lets any radiologist/admin read+write any row).
// undefined = still loading, null = no report saved for this scan yet — the
// ReportEditor's finalized/draft gating (and whether the "Save draft" upsert
// is even offered) reads this instead of the mock store.reports, so it
// reflects the real, current DB state rather than stale seed data.
export function useReport(scanId: string | null) {
  const [report, setReport] = useState<RadiologyReport | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!scanId) {
      setReport(null);
      return;
    }
    setReport(undefined);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("radiology_reports")
      .select("*")
      .eq("scan_id", scanId)
      .maybeSingle();
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setReport((data as RadiologyReport | null) ?? null);
  }, [scanId]);

  useEffect(() => {
    load();
  }, [load]);

  return { report, loadError, reload: load };
}

const TEMPLATES: Record<string, { findings: string; impression: string }> = {
  "Normal study": {
    findings:
      "No focal signal abnormality. Anatomy within normal limits for age. No mass, collection, or abnormal enhancement pattern.",
    impression: "Normal MRI examination. No acute abnormality.",
  },
  "Degenerative spine": {
    findings:
      "Vertebral alignment preserved. Disc desiccation at [level] with [central/paracentral] protrusion. No cord compression. Neural foramina [patent/narrowed].",
    impression: "Degenerative disc disease at [level]. Clinical correlation recommended.",
  },
  "Joint internal derangement": {
    findings:
      "Menisci: [describe]. Cruciate and collateral ligaments intact. Articular cartilage: [describe]. Small joint effusion.",
    impression: "[Grade] signal change in the [structure]. Correlate with clinical findings.",
  },
};

export default function ReportEditor({ scanId, onReportChanged }: { scanId: string; onReportChanged: () => void }) {
  const store = useStore();
  const { report: existing, loadError: reportLoadError, reload: reloadReport } = useReport(scanId);

  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [signature, setSignature] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Populate the editor from the real report once it loads (this component
  // is already remounted per-scan via key={selectedScan.id} on the parent,
  // so this only ever needs to run once per mount).
  useEffect(() => {
    if (!initialized && existing !== undefined) {
      setFindings(existing?.findings ?? "");
      setImpression(existing?.impression ?? "");
      setInitialized(true);
    }
  }, [existing, initialized]);

  const finalized = existing?.status === "finalized";

  function applyTemplate(name: string) {
    if (!name || finalized) return;
    const t = TEMPLATES[name];
    setFindings(t.findings);
    setImpression(t.impression);
    setMessage(`Template "${name}" applied — edit before signing.`);
  }

  async function saveDraft() {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("radiology_reports")
      .upsert(
        { scan_id: scanId, radiologist_id: store.currentUser.id, findings, impression },
        { onConflict: "scan_id" }
      )
      .select()
      .single();
    setSaving(false);
    if (error) {
      setMessage(`Could not save draft: ${error.message}`);
      return;
    }
    setMessage("Draft saved. It stays private to radiology until finalized.");
    reloadReport();
    onReportChanged();
  }

  async function finalize(e: React.FormEvent) {
    e.preventDefault();
    if (!findings.trim() || !impression.trim() || !signature.trim()) {
      setMessage("Findings, impression, and your typed signature are all required to finalize.");
      return;
    }
    setFinalizing(true);
    setMessage(null);
    const supabase = createClient();

    const { data: savedReport, error: saveError } = await supabase
      .from("radiology_reports")
      .upsert(
        { scan_id: scanId, radiologist_id: store.currentUser.id, findings, impression },
        { onConflict: "scan_id" }
      )
      .select()
      .single();
    if (saveError || !savedReport) {
      setFinalizing(false);
      setMessage(`Could not save report before finalizing: ${saveError?.message ?? "unknown error"}`);
      return;
    }

    // The signature_required_when_final check constraint enforces this
    // invariant server-side too.
    const { error: finalizeError } = await supabase
      .from("radiology_reports")
      .update({ status: "finalized", e_signature: signature.trim(), finalized_at: new Date().toISOString() })
      .eq("id", savedReport.id)
      .select()
      .single();
    setFinalizing(false);
    if (finalizeError) {
      setMessage(`Could not finalize report: ${finalizeError.message}`);
      return;
    }
    reloadReport();
    onReportChanged();
    setMessage("Report finalized and signed. The patient and referring doctor can now see it.");

    // The in-app patient (and referring-doctor) notification now fires
    // automatically via trg_notify_report_finalized
    // (backend/database/021_notify_referring_doctor_on_report.sql) — this
    // just sends the outbound email, same fire-and-forget pattern as every
    // other notifyPatient() call site.
    const { data: scanRow } = await supabase
      .from("mri_scans")
      .select("appointment_id, body_part")
      .eq("id", scanId)
      .single();
    if (scanRow) {
      const { data: aptRow } = await supabase
        .from("appointments")
        .select("id, patient_id, referring_doctor_id")
        .eq("id", scanRow.appointment_id)
        .single();
      if (aptRow) {
        notifyPatient(
          aptRow.patient_id,
          "report_ready",
          "Your MRI report is ready",
          `<p>Your ${scanRow.body_part} MRI report has been finalized and is ready to view.</p>`,
          aptRow.id
        );
        if (aptRow.referring_doctor_id) {
          const { data: patientProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", aptRow.patient_id)
            .single();
          notifyPatient(
            aptRow.referring_doctor_id,
            "report_ready",
            "A report for your patient is ready",
            `<p>${patientProfile?.full_name ?? "Your patient"}'s ${scanRow.body_part} MRI report has been finalized.</p>`,
            aptRow.id
          );
        }
      }
    }
  }

  return (
    <form onSubmit={finalize} className="card space-y-4 p-5">
      {reportLoadError && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Could not load this report: {reportLoadError}
        </p>
      )}
      {existing === undefined ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Loading report…
        </p>
      ) : finalized ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          <ShieldCheck size={16} aria-hidden />
          This report is finalized and immutable. Signed: {existing?.e_signature}
        </p>
      ) : (
        <div>
          <label htmlFor="rp-template" className="label">Report template</label>
          <select id="rp-template" className="input" defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
            <option value="" disabled>Choose a starting template…</option>
            {Object.keys(TEMPLATES).map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="rp-findings" className="label">Findings</label>
        <textarea
          id="rp-findings" rows={6} className="input font-mono text-[13px]"
          value={findings} readOnly={finalized}
          onChange={(e) => setFindings(e.target.value)}
          placeholder="Systematic description of the imaged anatomy"
        />
      </div>

      <div>
        <label htmlFor="rp-impression" className="label">Impression</label>
        <textarea
          id="rp-impression" rows={4} className="input font-mono text-[13px]"
          value={impression} readOnly={finalized}
          onChange={(e) => setImpression(e.target.value)}
          placeholder="Numbered diagnostic conclusions and recommendations"
        />
      </div>

      {!finalized && (
        <>
          <div>
            <label htmlFor="rp-sign" className="label">
              <PenLine size={12} className="mr-1 inline" aria-hidden />
              Electronic signature — type your full name and credentials
            </label>
            <input
              id="rp-sign" className="input italic"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="e.g. Dr. Kwame Osei, FRANZCR"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-slate-500">
              Signing finalizes the report, locks it from edits, and writes a compliance entry to the audit trail.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={saveDraft} className="btn-ghost" disabled={saving || finalizing}>
              <Save size={16} aria-hidden /> {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || finalizing || !findings.trim() || !impression.trim() || !signature.trim()}
            >
              <FileSignature size={16} aria-hidden /> {finalizing ? "Finalizing…" : "Finalize & sign report"}
            </button>
          </div>
        </>
      )}

      {message && (
        <p role="status" className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">{message}</p>
      )}
    </form>
  );
}
