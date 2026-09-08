"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ClipboardList, FileSignature, PenLine, Save, ShieldCheck, Stethoscope,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { EmptyState, SectionTitle, StatusChip } from "@/components/shared/ui";
import StaffMessagingPanel from "@/components/shared/StaffMessagingPanel";
import DicomViewer from "./DicomViewer";

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

export default function RadiologistWorkspace() {
  const store = useStore();

  const unreported = useMemo(
    () =>
      store.scans.filter((s) => {
        const rep = store.reports.find((r) => r.scan_id === s.id);
        return !rep || rep.status === "draft";
      }),
    [store.scans, store.reports]
  );

  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedScanId && unreported.length > 0) setSelectedScanId(unreported[0].id);
    if (selectedScanId && !store.scans.some((s) => s.id === selectedScanId)) setSelectedScanId(null);
  }, [unreported, selectedScanId, store.scans]);

  const selectedScan = store.scans.find((s) => s.id === selectedScanId) ?? null;
  const selectedApt = selectedScan
    ? store.appointments.find((a) => a.id === selectedScan.appointment_id)
    : null;
  const selectedPatient = selectedApt
    ? store.profiles.find((p) => p.id === selectedApt.patient_id)
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section id="unreported-scans" className="card p-5 sm:p-6">
        <SectionTitle
          icon={ClipboardList}
          title="Unreported scans"
          subtitle={`${unreported.length} stud${unreported.length === 1 ? "y" : "ies"} awaiting a finalized report`}
        />
        {unreported.length === 0 ? (
          <EmptyState message="Reading list is clear" hint="New studies appear here as soon as technicians log them." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unreported.map((s) => {
              const apt = store.appointments.find((a) => a.id === s.appointment_id);
              const patient = apt && store.profiles.find((p) => p.id === apt.patient_id);
              const draft = store.reports.find((r) => r.scan_id === s.id);
              const active = selectedScanId === s.id;
              const assignedRad = apt?.assigned_radiologist_id
                ? store.profiles.find((p) => p.id === apt.assigned_radiologist_id)
                : null;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedScanId(s.id)}
                    aria-pressed={active}
                    className={`w-full rounded-lg border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical ${
                      active ? "border-medical bg-medical-light" : "border-slate-200 bg-white hover:border-medical"
                    }`}
                  >
                    <p className="text-sm font-bold text-navy">{patient?.full_name ?? "Unknown"} — {s.body_part}</p>
                    <p className="text-xs text-slate-500">
                      {s.performed_at ? format(parseISO(s.performed_at), "d MMM, h:mm a") : "time n/a"} · {s.machine_name}
                    </p>
                    {assignedRad && (
                      <p className="mt-1 text-[11px] font-semibold text-medical">
                        {assignedRad.id === store.currentUser.id ? "Assigned to you" : `Assigned to ${assignedRad.full_name}`}
                      </p>
                    )}
                    <div className="mt-1.5">
                      {draft ? <StatusChip status="draft" /> : <span className="chip bg-slate-100 text-slate-600">not started</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selectedScan && selectedApt && (
        <div className="grid gap-6 xl:grid-cols-2">
          <section id="dicom-viewer">
            <SectionTitle
              icon={Stethoscope}
              title="DICOM viewer"
              subtitle={`${selectedPatient?.full_name} · ${selectedScan.body_part} · ${selectedScan.protocol}`}
            />
            <DicomViewer
              scanId={selectedScan.id}
              bodyPart={selectedScan.body_part}
              meta={{
                protocol: selectedScan.protocol,
                machine: selectedScan.machine_name ?? undefined,
                performedAt: selectedScan.performed_at ?? undefined,
              }}
              canAnnotate
              annotations={store.annotations.filter((a) => a.scan_id === selectedScan.id)}
              onAddAnnotation={(x, y, note) => store.addAnnotation(selectedScan.id, x, y, note)}
              onRemoveAnnotation={store.removeAnnotation}
            />
          </section>

          <section id="report-editor">
            <SectionTitle icon={FileSignature} title="Report editor" subtitle="Structured findings, impression, and legal sign-off" />
            <ReportEditor key={selectedScan.id} scanId={selectedScan.id} />
          </section>
        </div>
      )}

      <StaffMessagingPanel />
    </div>
  );
}

function ReportEditor({ scanId }: { scanId: string }) {
  const store = useStore();
  const existing = store.reports.find((r) => r.scan_id === scanId);

  const [findings, setFindings] = useState(existing?.findings ?? "");
  const [impression, setImpression] = useState(existing?.impression ?? "");
  const [signature, setSignature] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const finalized = existing?.status === "finalized";

  function applyTemplate(name: string) {
    if (!name || finalized) return;
    const t = TEMPLATES[name];
    setFindings(t.findings);
    setImpression(t.impression);
    setMessage(`Template "${name}" applied — edit before signing.`);
  }

  function saveDraft() {
    store.saveReportDraft(scanId, findings, impression);
    setMessage("Draft saved. It stays private to radiology until finalized.");
  }

  function finalize(e: React.FormEvent) {
    e.preventDefault();
    if (!findings.trim() || !impression.trim() || !signature.trim()) {
      setMessage("Findings, impression, and your typed signature are all required to finalize.");
      return;
    }
    const reportId = store.saveReportDraft(scanId, findings, impression);
    store.finalizeReport(reportId, signature.trim());
    setMessage("Report finalized and signed. The patient and referring doctor can now see it.");
  }

  return (
    <form onSubmit={finalize} className="card space-y-4 p-5">
      {finalized ? (
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
            <button type="button" onClick={saveDraft} className="btn-ghost">
              <Save size={16} aria-hidden /> Save draft
            </button>
            <button type="submit" className="btn-primary" disabled={!findings.trim() || !impression.trim() || !signature.trim()}>
              <FileSignature size={16} aria-hidden /> Finalize & sign report
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
