"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileSignature, Stethoscope } from "lucide-react";
import { useStore } from "@/frontend/lib/store";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";
import DicomViewer from "@/frontend/components/radiologist/DicomViewer";
import ReportEditor from "@/frontend/components/radiologist/ReportEditor";
import { useAnnotations } from "@/frontend/components/radiologist/useAnnotations";
import { useScans } from "@/frontend/lib/hooks/useScans";
import { useReports } from "@/frontend/lib/hooks/useReports";
import { useAppointments } from "@/frontend/lib/hooks/useAppointments";
import { useProfiles } from "@/frontend/lib/hooks/useProfiles";

// useSearchParams() (for the ?scan=<id> deep link from /dashboard/unreported's
// scan cards) requires a Suspense boundary in the app router — mirrors
// app/(app)/dashboard/scan-logger/page.tsx's Page/Inner split.
export default function ReadPage() {
  return (
    <Suspense>
      <ReadPageInner />
    </Suspense>
  );
}

function ReadPageInner() {
  const { effectiveRole } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (effectiveRole !== "radiologist") router.replace("/dashboard");
  }, [effectiveRole, router]);

  const { data: scans, loadError: scansLoadError } = useScans();
  const { data: reports, loadError: reportsLoadError, reload: reloadReports } = useReports();
  const { data: appointments, loadError: aptLoadError } = useAppointments();
  const { data: profiles, loadError: profilesLoadError } = useProfiles();

  const searchParams = useSearchParams();
  const queryScanId = searchParams.get("scan");

  // No ?scan= param (e.g. landing here directly) — fall back to the first
  // unreported scan, same auto-select behavior /dashboard/unreported's
  // predecessor (RadiologistWorkspace) used to do inline.
  const unreported = useMemo(
    () =>
      (scans ?? []).filter((s) => {
        const rep = (reports ?? []).find((r) => r.scan_id === s.id);
        return !rep || rep.status === "draft";
      }),
    [scans, reports]
  );

  const [fallbackScanId, setFallbackScanId] = useState<string | null>(null);
  useEffect(() => {
    if (!fallbackScanId && unreported.length > 0) setFallbackScanId(unreported[0].id);
    if (fallbackScanId && scans && !scans.some((s) => s.id === fallbackScanId)) setFallbackScanId(null);
  }, [unreported, fallbackScanId, scans]);

  const selectedScanId = queryScanId ?? fallbackScanId;
  const selectedScan = (scans ?? []).find((s) => s.id === selectedScanId) ?? null;
  const selectedApt = selectedScan
    ? (appointments ?? []).find((a) => a.id === selectedScan.appointment_id)
    : null;
  const selectedPatient = selectedApt
    ? (profiles ?? []).find((p) => p.id === selectedApt.patient_id)
    : null;

  const {
    annotations, loadError: annotationsLoadError, actionError: annotationsActionError,
    addAnnotation, removeAnnotation,
  } = useAnnotations(selectedScan?.id ?? null);

  const loadError = scansLoadError || reportsLoadError || aptLoadError || profilesLoadError;
  const loading = (!scans || !reports || !appointments || !profiles) && !loadError;

  if (effectiveRole !== "radiologist") return null;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {loadError && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Could not load: {loadError}
        </p>
      )}

      {!loading && !selectedScan ? (
        <div className="space-y-2">
          <EmptyState message="No scan selected" hint="Pick a study from the unreported scans list to open it here." />
          <Link href="/dashboard/unreported" className="inline-block text-sm font-semibold text-medical hover:underline">
            Go to unreported scans →
          </Link>
        </div>
      ) : selectedScan && selectedApt ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <section id="dicom-viewer">
            <SectionTitle
              icon={Stethoscope}
              title="DICOM viewer"
              subtitle={`${selectedPatient?.full_name} · ${selectedScan.body_part} · ${selectedScan.protocol}`}
            />
            {(annotationsLoadError || annotationsActionError) && (
              <p role="alert" className="mb-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {annotationsLoadError && `Could not load annotations: ${annotationsLoadError}`}
                {annotationsActionError && `Could not save annotation: ${annotationsActionError}`}
              </p>
            )}
            <DicomViewer
              scanId={selectedScan.id}
              bodyPart={selectedScan.body_part}
              meta={{
                protocol: selectedScan.protocol,
                machine: selectedScan.machine_name ?? undefined,
                performedAt: selectedScan.performed_at ?? undefined,
              }}
              canAnnotate
              annotations={annotations ?? []}
              onAddAnnotation={addAnnotation}
              onRemoveAnnotation={removeAnnotation}
            />
          </section>

          <section id="report-editor">
            <SectionTitle icon={FileSignature} title="Report editor" subtitle="Structured findings, impression, and legal sign-off" />
            <ReportEditor key={selectedScan.id} scanId={selectedScan.id} onReportChanged={reloadReports} />
          </section>
        </div>
      ) : null}
    </div>
  );
}
