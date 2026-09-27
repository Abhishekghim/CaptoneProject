import type { DicomFrame } from "./parse";

export interface DicomSeries {
  uid: string;
  number?: number;
  description?: string;
  modality?: string;
  /** In display order, first slice to last. */
  frames: DicomFrame[];
}

export interface DicomStudy {
  patientName?: string;
  patientID?: string;
  studyDescription?: string;
  studyDate?: string;
  series: DicomSeries[];
}

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function sliceNormal(frame: DicomFrame): [number, number, number] | null {
  const o = frame.imageOrientation;
  if (!o) return null;
  const n: [number, number, number] = [o[1] * o[5] - o[2] * o[4], o[2] * o[3] - o[0] * o[5], o[0] * o[4] - o[1] * o[3]];
  const len = Math.hypot(...n);
  return len > 0 ? [n[0] / len, n[1] / len, n[2] / len] : null;
}

/**
 * Orders a series' frames the way a stack viewer should: by position along
 * the slice normal when every frame has geometry, otherwise by instance
 * number, then slice location, then file name. Frames of one multi-frame
 * instance keep their stored order.
 */
export function sortFrames(frames: DicomFrame[]): DicomFrame[] {
  const normal = frames.length > 0 ? sliceNormal(frames[0]) : null;
  const useGeometry =
    normal !== null && frames.every((f) => f.imagePosition) && new Set(frames.map((f) => f.sopInstanceUID)).size === frames.length;
  const project = (f: DicomFrame) => {
    const p = f.imagePosition!;
    return p[0] * normal![0] + p[1] * normal![1] + p[2] * normal![2];
  };
  const allInstance = frames.every((f) => f.instanceNumber !== undefined);
  const allLocation = frames.every((f) => f.sliceLocation !== undefined);

  return [...frames].sort((a, b) => {
    let d = 0;
    if (useGeometry) d = project(a) - project(b);
    else if (allInstance) d = a.instanceNumber! - b.instanceNumber!;
    else if (allLocation) d = a.sliceLocation! - b.sliceLocation!;
    if (d !== 0) return d;
    if (a.sopInstanceUID === b.sopInstanceUID) return a.frameIndex - b.frameIndex;
    return naturalCollator.compare(a.fileName, b.fileName) || a.frameIndex - b.frameIndex;
  });
}

/** Groups frames into series (deduplicating repeated files) and orders everything for display. */
export function buildStudy(frames: DicomFrame[]): DicomStudy | null {
  const unique = new Map<string, DicomFrame>();
  for (const f of frames) if (!unique.has(f.key)) unique.set(f.key, f);
  if (unique.size === 0) return null;

  const bySeries = new Map<string, DicomFrame[]>();
  for (const f of Array.from(unique.values())) {
    const list = bySeries.get(f.seriesInstanceUID) ?? [];
    list.push(f);
    bySeries.set(f.seriesInstanceUID, list);
  }

  const series: DicomSeries[] = Array.from(bySeries.entries()).map(([uid, list]) => {
    const sorted = sortFrames(list);
    const first = sorted[0];
    return { uid, number: first.seriesNumber, description: first.seriesDescription, modality: first.modality, frames: sorted };
  });
  series.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || naturalCollator.compare(a.description ?? "", b.description ?? ""));

  const first = series[0].frames[0];
  return {
    patientName: first.patientName,
    patientID: first.patientID,
    studyDescription: first.studyDescription,
    studyDate: first.studyDate,
    series,
  };
}
