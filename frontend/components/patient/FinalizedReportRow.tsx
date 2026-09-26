"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Download } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";
import type { Appointment, ImageAnnotation, MriScan, RadiologyReport } from "@/shared/types";
import { StatusChip } from "@/frontend/components/shared/ui";
import DicomViewer from "@/frontend/components/radiologist/DicomViewer";

/* ------------------------------------------------------------------ */
/* Finalized reports — real radiology_reports read, replacing the mock  */
/* store's reports/scans/appointments filter. reports_patient_read_    */
/* finalized RLS already scopes reads to the patient's own finalized    */
/* reports, but the embedded-select shorthand for a two-hop join         */
/* (radiology_reports -> mri_scans -> appointments) needs FK-name hints  */
/* the migrations never named — same reasoning TechnicianPortal's        */
/* useTodaysQueue documents — so this fetches the patient's own          */
/* appointments, then their scans, then finalized reports for those      */
/* scans, and joins them in JS. null = still loading, [] = loaded, none. */
/* ------------------------------------------------------------------ */
export type FinalReportEntry = { report: RadiologyReport; scan: MriScan; apt: Appointment };

export function useMyFinalReports(patientId: string) {
  const [reports, setReports] = useState<FinalReportEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: appointments, error: aptError } = await supabase
      .from("appointments")
      .select("*")
      .eq("patient_id", patientId);
    if (aptError) {
      setLoadError(aptError.message);
      return;
    }
    const aptRows = (appointments ?? []) as Appointment[];
    if (aptRows.length === 0) {
      setLoadError(null);
      setReports([]);
      return;
    }

    const aptIds = aptRows.map((a) => a.id);
    const { data: scans, error: scanError } = await supabase
      .from("mri_scans")
      .select("*")
      .in("appointment_id", aptIds);
    if (scanError) {
      setLoadError(scanError.message);
      return;
    }
    const scanRows = (scans ?? []) as MriScan[];
    if (scanRows.length === 0) {
      setLoadError(null);
      setReports([]);
      return;
    }

    const scanIds = scanRows.map((s) => s.id);
    const { data: reportsData, error: reportError } = await supabase
      .from("radiology_reports")
      .select("*")
      .eq("status", "finalized")
      .in("scan_id", scanIds);
    if (reportError) {
      setLoadError(reportError.message);
      return;
    }

    const aptById = new Map(aptRows.map((a) => [a.id, a]));
    const scanById = new Map(scanRows.map((s) => [s.id, s]));

    setLoadError(null);
    setReports(
      ((reportsData ?? []) as RadiologyReport[])
        .map((r) => {
          const scan = scanById.get(r.scan_id);
          const apt = scan ? aptById.get(scan.appointment_id) : undefined;
          return scan && apt ? { report: r, scan, apt } : null;
        })
        .filter((x): x is FinalReportEntry => x !== null)
    );
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  return { reports, loadError, reload: load };
}

/* ------------------------------------------------------------------ */
/* Finalized report row — image released alongside the report          */
/* ------------------------------------------------------------------ */
// Real, view-only image_annotations read for one scan — image_annotations_read
// RLS (backend/database/018_image_annotations.sql) already lets a patient
// read annotations on their own scans via the scan -> appointment -> patient
// join, so no new policy is needed here. Loaded lazily when the image is
// shown, matching ReferringDoctorPortal.tsx's ScanImageToggle (the other
// place a non-staff viewer reads annotations read-only).
function useScanAnnotations(scanId: string, enabled: boolean) {
  const [annotations, setAnnotations] = useState<ImageAnnotation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("image_annotations")
        .select("*")
        .eq("scan_id", scanId)
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
  }, [scanId, enabled]);

  return { annotations, loadError };
}

export function FinalizedReportRow({
  report, scan, apt,
}: {
  report: RadiologyReport;
  scan: MriScan;
  apt: Appointment;
}) {
  const [showImage, setShowImage] = useState(false);
  const { annotations, loadError: annotationsLoadError } = useScanAnnotations(scan.id, showImage);

  return (
    <li className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-navy">
            {scan.body_part} MRI — {format(parseISO(apt.date), "d MMM yyyy")}
          </p>
          <p className="text-xs text-slate-500">
            {scan.protocol} · {scan.machine_name}
          </p>
        </div>
        <StatusChip status={report.status} />
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="label">Findings</dt>
          <dd className="whitespace-pre-wrap text-slate-700">{report.findings}</dd>
        </div>
        <div>
          <dt className="label">Impression</dt>
          <dd className="whitespace-pre-wrap text-slate-700">{report.impression}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500">
          Signed: <span className="font-semibold text-navy">{report.e_signature}</span>
          {report.finalized_at && <> · {format(parseISO(report.finalized_at), "d MMM yyyy, h:mm a")}</>}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost text-xs" onClick={() => setShowImage((v) => !v)}>
            {showImage ? "Hide scan image" : "View scan image"}
          </button>
          <DownloadDicomButton scanId={scan.id} bodyPart={scan.body_part} />
        </div>
      </div>
      {showImage && (
        <div className="mt-3">
          {annotationsLoadError && (
            <p role="alert" className="mb-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Could not load annotations: {annotationsLoadError}
            </p>
          )}
          <DicomViewer
            scanId={scan.id}
            bodyPart={scan.body_part}
            meta={{ protocol: scan.protocol, machine: scan.machine_name ?? undefined, performedAt: scan.performed_at ?? undefined }}
            annotations={annotations ?? []}
            canAnnotate={false}
          />
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Mock DICOM download                                                 */
/* ------------------------------------------------------------------ */
function DownloadDicomButton({ scanId, bodyPart }: { scanId: string; bodyPart: string }) {
  function download() {
    // Build a small mock DICOM-style payload client-side and download it.
    const header = [
      "MOCK-DICOM v1.0 — Capital Radiology demo export",
      `SOPInstanceUID: 1.2.840.99999.${scanId}`,
      `BodyPartExamined: ${bodyPart.toUpperCase()}`,
      `Modality: MR`,
      `ExportedAt: ${new Date().toISOString()}`,
      "",
      "This file simulates a DICOM export. In production the app serves the",
      "real .dcm object from the private 'dicom' storage bucket via a signed URL.",
    ].join("\n");
    const blob = new Blob([header], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scanId}-${bodyPart.replace(/\s+/g, "-").toLowerCase()}.dcm`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={download} className="btn-ghost text-xs">
      <Download size={14} aria-hidden /> Download DICOM
    </button>
  );
}
