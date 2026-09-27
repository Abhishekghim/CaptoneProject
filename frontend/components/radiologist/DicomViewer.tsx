"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Contrast,
  FileUp,
  FolderOpen,
  Keyboard,
  Loader2,
  MapPin,
  Maximize,
  Minimize,
  Move,
  RotateCcw,
  ScanSearch,
  SunMedium,
  X,
  ZoomIn,
} from "lucide-react";
import type { ImageAnnotation } from "@/shared/types";
import { listStoredDicom } from "@/frontend/lib/storage";
import { fileSources, filesFromDataTransfer, loadStudy, type DicomSource, type SkippedFile } from "@/frontend/lib/dicom/load";
import { transferSyntaxName, type DicomFrame } from "@/frontend/lib/dicom/parse";
import type { DicomStudy } from "@/frontend/lib/dicom/study";
import { defaultWindow, fullRangeWindow, renderFrameToRgba, type VoiWindow } from "@/frontend/lib/dicom/render";
import { clampSlice, createWheelStepper } from "@/frontend/lib/dicom/navigation";

type Tool = "windowLevel" | "pan" | "zoom" | "annotate";
type Status =
  | { kind: "idle" }
  | { kind: "loading"; done: number; total: number }
  | { kind: "error"; message: string }
  | { kind: "ready" };

export interface AnnotationImageRef {
  sopInstanceUid: string;
  frameNumber: number | null;
}

export interface DicomViewerProps {
  scanId: string;
  bodyPart: string;
  meta?: { protocol?: string; machine?: string; performedAt?: string };
  annotations?: ImageAnnotation[];
  onAddAnnotation?: (x: number, y: number, note: string, image: AnnotationImageRef) => void;
  onRemoveAnnotation?: (id: string) => void;
  canAnnotate?: boolean;
  /** Bucket-relative path from mri_scans.dicom_image_url: one file, or a folder ending in "/". */
  dicomImageUrl?: string | null;
  /** Lets the user open DICOM files from their own computer (not saved to the scan). */
  allowLocalFiles?: boolean;
  variant?: "workspace" | "compact";
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function formatDicomDate(d?: string) {
  if (!d || !/^\d{8}$/.test(d)) return d;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function fmt(n: number | undefined, digits = 1) {
  return n === undefined ? undefined : Number(n.toFixed(digits)).toString();
}

function framePosition(frame: DicomFrame) {
  if (frame.sliceLocation !== undefined) return `Loc ${fmt(frame.sliceLocation)} mm`;
  return undefined;
}

const TOOLS: { id: Tool; label: string; key: string; icon: typeof Move }[] = [
  { id: "windowLevel", label: "Window / level", key: "W", icon: SunMedium },
  { id: "pan", label: "Pan", key: "P", icon: Move },
  { id: "zoom", label: "Zoom", key: "Z", icon: ZoomIn },
  { id: "annotate", label: "Annotate", key: "A", icon: MapPin },
];

const SHORTCUTS: [string, string][] = [
  ["Mouse wheel / trackpad", "Next / previous slice"],
  ["Ctrl + wheel, pinch", "Zoom"],
  ["↑ ← / ↓ →", "Previous / next slice"],
  ["Page Up / Page Down", "Back / forward 10 slices"],
  ["Home / End", "First / last slice"],
  ["Left drag", "Active tool"],
  ["Middle drag / right drag", "Pan / zoom"],
  ["W  P  Z  A", "Window-level, pan, zoom, annotate"],
  ["+ / −", "Zoom in / out"],
  ["F", "Fit to viewport"],
  ["I", "Invert"],
  ["R", "Reset view"],
];

function ToolbarButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
  shortcut,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-40 ${
        pressed ? "bg-sky-600 text-white" : "text-slate-200 hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

export default function DicomViewer({
  scanId,
  bodyPart,
  meta,
  annotations = [],
  onAddAnnotation,
  onRemoveAnnotation,
  canAnnotate = false,
  dicomImageUrl,
  allowLocalFiles = false,
  variant = "workspace",
}: DicomViewerProps) {
  const helpId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const loadToken = useRef(0);

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [study, setStudy] = useState<DicomStudy | null>(null);
  const [source, setSource] = useState<"stored" | "local" | null>(null);
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);
  const [seriesIndex, setSeriesIndex] = useState(0);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("windowLevel");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [voi, setVoi] = useState<VoiWindow | null>(null);
  const [invert, setInvert] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [pendingNote, setPendingNote] = useState("");

  const series = study?.series[seriesIndex] ?? null;
  const frames = series?.frames ?? [];
  const count = frames.length;
  const index = clampSlice(sliceIndex, count);
  const frame: DicomFrame | null = frames[index] ?? null;
  const baseVoi = frame ? defaultWindow(frame) : null;
  const effectiveVoi = voi ?? baseVoi;
  const canPin = canAnnotate && source === "stored" && Boolean(onAddAnnotation);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setVoi(null);
    setInvert(false);
  }, []);

  const applyResult = useCallback(
    (token: number, result: { study: DicomStudy | null; skipped: SkippedFile[] }, from: "stored" | "local", emptyMessage: string) => {
      if (token !== loadToken.current) return;
      setSkipped(result.skipped);
      setSeriesIndex(0);
      setSliceIndex(0);
      resetView();
      setPendingPin(null);
      if (!result.study) {
        setStudy(null);
        setSource(null);
        setStatus({ kind: "error", message: emptyMessage });
        return;
      }
      setStudy(result.study);
      setSource(from);
      setStatus({ kind: "ready" });
    },
    [resetView]
  );

  // The scan's stored study.
  useEffect(() => {
    const token = ++loadToken.current;
    setStudy(null);
    setSource(null);
    setSkipped([]);
    setPendingPin(null);
    if (!dicomImageUrl) {
      setStatus({ kind: "idle" });
      return;
    }
    setStatus({ kind: "loading", done: 0, total: 0 });
    (async () => {
      try {
        const entries = await listStoredDicom(dicomImageUrl);
        if (token !== loadToken.current) return;
        const sources: DicomSource[] = entries.map((e) => ({
          name: e.name,
          read: async () => {
            const res = await fetch(e.url);
            if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`);
            return res.arrayBuffer();
          },
        }));
        const result = await loadStudy(sources, (done, total) => {
          if (token === loadToken.current) setStatus({ kind: "loading", done, total });
        });
        applyResult(token, result, "stored", "This scan's stored files don't contain any images this viewer can display.");
      } catch (e) {
        if (token !== loadToken.current) return;
        setStatus({ kind: "error", message: `Couldn't load this scan's images: ${e instanceof Error ? e.message : String(e)}` });
      }
    })();
  }, [dicomImageUrl, scanId, applyResult]);

  const openFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const token = ++loadToken.current;
      setStatus({ kind: "loading", done: 0, total: files.length });
      const result = await loadStudy(fileSources(files), (done, total) => {
        if (token === loadToken.current) setStatus({ kind: "loading", done, total });
      });
      applyResult(token, result, "local", "None of the selected files could be displayed.");
    },
    [applyResult]
  );

  // Viewport size, tracked so the canvas renders at native device resolution.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // The current frame, window/levelled at native resolution.
  const wc = effectiveVoi?.center;
  const ww = effectiveVoi?.width;
  const frameImage = useMemo(() => {
    if (!frame || wc === undefined || ww === undefined) return null;
    const c = document.createElement("canvas");
    c.width = frame.columns;
    c.height = frame.rows;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(frame.columns, frame.rows);
    renderFrameToRgba(frame, { center: wc, width: ww }, invert, img.data);
    ctx.putImageData(img, 0, 0);
    return c;
  }, [frame, wc, ww, invert]);

  // Screen-space geometry of the image (honours non-square pixel spacing).
  const geometry = useMemo(() => {
    if (!frame || box.w === 0 || box.h === 0) return null;
    const [rowSpacing, colSpacing] = frame.pixelSpacing ?? [1, 1];
    const fit = Math.min(box.w / (frame.columns * colSpacing), box.h / (frame.rows * rowSpacing));
    const s = fit * zoom;
    return { sx: colSpacing * s, sy: rowSpacing * s, cx: box.w / 2 + pan.x, cy: box.h / 2 + pan.y, cols: frame.columns, rows: frame.rows };
  }, [frame, box, zoom, pan]);

  const imageToScreen = useCallback(
    (col: number, row: number) =>
      geometry ? { x: geometry.cx + (col - geometry.cols / 2) * geometry.sx, y: geometry.cy + (row - geometry.rows / 2) * geometry.sy } : null,
    [geometry]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.max(1, Math.round(box.w * dpr));
    canvas.height = Math.max(1, Math.round(box.h * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, box.w, box.h);
    if (!frameImage || !geometry) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const w = geometry.cols * geometry.sx;
    const h = geometry.rows * geometry.sy;
    ctx.drawImage(frameImage, geometry.cx - w / 2, geometry.cy - h / 2, w, h);
  }, [frameImage, geometry, box]);

  const goTo = useCallback((i: number) => setSliceIndex(clampSlice(i, count)), [count]);
  const step = useCallback((delta: number) => setSliceIndex((i) => clampSlice(clampSlice(i, count) + delta, count)), [count]);

  // Wheel scrolls slices. Registered natively: React's wheel listener is
  // passive, so it can't stop the page from scrolling.
  const countRef = useRef(count);
  countRef.current = count;
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const stepper = createWheelStepper();
    const onWheel = (e: WheelEvent) => {
      if (countRef.current === 0) return;
      e.preventDefault();
      if (e.ctrlKey) {
        setZoom((z) => clampZoom(z * Math.exp(-e.deltaY * 0.01)));
        return;
      }
      const steps = stepper(e.deltaY, e.deltaMode);
      if (steps) setSliceIndex((i) => clampSlice(clampSlice(i, countRef.current) + steps, countRef.current));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const drag = useRef<{ tool: Tool; x: number; y: number; pan: { x: number; y: number }; zoom: number; voi: VoiWindow } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    viewportRef.current?.focus({ preventScroll: true });
    if (!frame || !effectiveVoi) return;
    const active: Tool = e.button === 1 ? "pan" : e.button === 2 ? "zoom" : tool;
    if (active === "annotate") {
      if (!canPin || !geometry) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const col = (e.clientX - rect.left - geometry.cx) / geometry.sx + geometry.cols / 2;
      const row = (e.clientY - rect.top - geometry.cy) / geometry.sy + geometry.rows / 2;
      if (col < 0 || row < 0 || col > geometry.cols || row > geometry.rows) return;
      setPendingPin({ x: col, y: row });
      setPendingNote("");
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { tool: active, x: e.clientX, y: e.clientY, pan, zoom, voi: effectiveVoi };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d || !frame) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.tool === "pan") setPan({ x: d.pan.x + dx, y: d.pan.y + dy });
    else if (d.tool === "zoom") setZoom(clampZoom(d.zoom * Math.exp(-dy * 0.01)));
    else if (d.tool === "windowLevel") {
      const sensitivity = Math.max(0.05, (frame.maxValue - frame.minValue) / Math.max(300, box.h));
      setVoi({ center: d.voi.center + dy * sensitivity, width: Math.max(1, d.voi.width + dx * sensitivity) });
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape" && pendingPin) {
      e.preventDefault();
      setPendingPin(null);
      return;
    }
    if (!frame) return;
    const actions: Record<string, () => void> = {
      ArrowUp: () => step(-1),
      ArrowLeft: () => step(-1),
      ArrowDown: () => step(1),
      ArrowRight: () => step(1),
      PageUp: () => step(-10),
      PageDown: () => step(10),
      Home: () => goTo(0),
      End: () => goTo(count - 1),
      "+": () => setZoom((z) => clampZoom(z * 1.25)),
      "=": () => setZoom((z) => clampZoom(z * 1.25)),
      "-": () => setZoom((z) => clampZoom(z / 1.25)),
      _: () => setZoom((z) => clampZoom(z / 1.25)),
      f: fitToViewport,
      r: resetView,
      i: () => setInvert((v) => !v),
      w: () => setTool("windowLevel"),
      p: () => setTool("pan"),
      z: () => setTool("zoom"),
      ...(canPin ? { a: () => setTool("annotate") } : {}),
    };
    const action = actions[e.key] ?? actions[e.key.toLowerCase()];
    if (!action) return;
    e.preventDefault();
    action();
  }

  function fitToViewport() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (!allowLocalFiles) return;
    openFiles(await filesFromDataTransfer(e.dataTransfer));
  }

  function toggleFullscreen() {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  }

  const visibleAnnotations = useMemo(() => {
    if (source !== "stored" || !frame) return [];
    return annotations.filter(
      (a) => !a.sop_instance_uid || (a.sop_instance_uid === frame.sopInstanceUID && (a.frame_number ?? 1) === frame.frameIndex + 1)
    );
  }, [annotations, frame, source]);

  const seriesThumbs = useMemo(() => {
    if (!study || study.series.length < 2) return [];
    return study.series.map((s) => {
      const f = s.frames[Math.floor(s.frames.length / 2)];
      const c = document.createElement("canvas");
      c.width = f.columns;
      c.height = f.rows;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      const img = ctx.createImageData(f.columns, f.rows);
      renderFrameToRgba(f, defaultWindow(f), false, img.data);
      ctx.putImageData(img, 0, 0);
      return c.toDataURL("image/jpeg", 0.7);
    });
  }, [study]);

  const viewportHeight = fullscreen
    ? "h-[calc(100vh-8.5rem)]"
    : variant === "compact"
      ? "h-[420px]"
      : "h-[min(74vh,880px)] min-h-[440px]";

  const metadata: [string, string | undefined][] = frame
    ? [
        ["Patient", study?.patientName],
        ["Patient ID", study?.patientID],
        ["Study date", formatDicomDate(study?.studyDate)],
        ["Study", study?.studyDescription],
        ["Series", [series?.number !== undefined ? `#${series.number}` : undefined, series?.description].filter(Boolean).join(" ") || undefined],
        ["Modality", frame.modality],
        ["Body part", frame.bodyPartExamined],
        ["Matrix", `${frame.columns} × ${frame.rows}`],
        ["Pixel spacing", frame.pixelSpacing ? `${fmt(frame.pixelSpacing[0], 3)} × ${fmt(frame.pixelSpacing[1], 3)} mm` : undefined],
        ["Slice thickness", frame.sliceThickness !== undefined ? `${fmt(frame.sliceThickness, 2)} mm` : undefined],
        ["Slice location", frame.sliceLocation !== undefined ? `${fmt(frame.sliceLocation, 2)} mm` : undefined],
        ["Instance", frame.instanceNumber !== undefined ? String(frame.instanceNumber) : undefined],
        ["Frame", frame.numberOfFrames > 1 ? `${frame.frameIndex + 1} of ${frame.numberOfFrames}` : undefined],
        ["TR / TE", frame.repetitionTime !== undefined || frame.echoTime !== undefined ? `${fmt(frame.repetitionTime) ?? "–"} / ${fmt(frame.echoTime) ?? "–"} ms` : undefined],
        ["Field strength", frame.magneticFieldStrength !== undefined ? `${fmt(frame.magneticFieldStrength)} T` : undefined],
        ["Transfer syntax", transferSyntaxName(frame.transferSyntaxUID)],
        ["File", frame.fileName],
      ]
    : [];

  const overlay = "pointer-events-none absolute font-mono text-[11px] leading-tight text-slate-100 [text-shadow:0_1px_2px_#000]";

  return (
    <div
      ref={rootRef}
      className={`flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-200 ${fullscreen ? "h-screen rounded-none" : ""}`}
    >
      {/* Toolbar */}
      <div role="toolbar" aria-label="Image tools" className="flex flex-wrap items-center gap-1 border-b border-slate-800 px-2 py-1.5">
        {TOOLS.filter((t) => t.id !== "annotate" || canAnnotate).map((t) => (
          <ToolbarButton
            key={t.id}
            label={t.id === "annotate" && !canPin ? "Annotate (only on this scan's stored images)" : t.label}
            shortcut={t.key}
            pressed={tool === t.id}
            disabled={!frame || (t.id === "annotate" && !canPin)}
            onClick={() => setTool(t.id)}
          >
            <t.icon size={16} aria-hidden />
            <span className="hidden sm:inline">{t.label}</span>
          </ToolbarButton>
        ))}
        <span aria-hidden className="mx-1 h-6 w-px bg-slate-800" />
        <ToolbarButton label="Invert" shortcut="I" pressed={invert} disabled={!frame} onClick={() => setInvert((v) => !v)}>
          <Contrast size={16} aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Fit to viewport" shortcut="F" disabled={!frame} onClick={fitToViewport}>
          <ScanSearch size={16} aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Reset view" shortcut="R" disabled={!frame} onClick={resetView}>
          <RotateCcw size={16} aria-hidden />
        </ToolbarButton>

        {frame && effectiveVoi && (
          <div className="ml-1 flex items-center gap-1.5 text-xs">
            <label className="flex items-center gap-1">
              <span className="text-slate-400">W</span>
              <input
                type="number"
                min={1}
                value={Math.round(effectiveVoi.width)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 1) setVoi({ center: effectiveVoi.center, width: v });
                }}
                aria-label="Window width"
                className="w-16 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-100"
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-400">L</span>
              <input
                type="number"
                value={Math.round(effectiveVoi.center)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setVoi({ center: v, width: effectiveVoi.width });
                }}
                aria-label="Window level (centre)"
                className="w-16 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-100"
              />
            </label>
            <select
              aria-label="Window preset"
              value=""
              onChange={(e) => {
                if (e.target.value === "file") setVoi(null);
                if (e.target.value === "full") setVoi(fullRangeWindow(frame));
              }}
              className="rounded border border-slate-700 bg-slate-900 px-1 py-1 text-slate-100"
            >
              <option value="">Preset…</option>
              <option value="file">From image header</option>
              <option value="full">Full pixel range</option>
            </select>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {allowLocalFiles && (
            <>
              <ToolbarButton label="Open DICOM files" onClick={() => fileInputRef.current?.click()}>
                <FileUp size={16} aria-hidden />
                <span className="hidden md:inline">Open files</span>
              </ToolbarButton>
              <ToolbarButton label="Open DICOM folder" onClick={() => folderInputRef.current?.click()}>
                <FolderOpen size={16} aria-hidden />
                <span className="hidden md:inline">Open folder</span>
              </ToolbarButton>
            </>
          )}
          <ToolbarButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize size={16} aria-hidden /> : <Maximize size={16} aria-hidden />}
          </ToolbarButton>
          <details className="relative">
            <summary
              className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
              aria-label="Keyboard and mouse shortcuts"
              title="Keyboard and mouse shortcuts"
            >
              <Keyboard size={16} aria-hidden />
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs shadow-xl">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                {SHORTCUTS.map(([keys, action]) => (
                  <React.Fragment key={keys}>
                    <dt className="font-mono text-sky-300">{keys}</dt>
                    <dd className="text-slate-300">{action}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          </details>
        </div>
        {allowLocalFiles && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              data-testid="dicom-file-input"
              onChange={(e) => {
                openFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              onChange={(e) => {
                openFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Viewport */}
          <div
            ref={viewportRef}
            tabIndex={0}
            role="application"
            aria-roledescription="image viewer"
            aria-label={
              frame
                ? `${series?.description ?? bodyPart} — slice ${index + 1} of ${count}`
                : `DICOM viewer for ${bodyPart} — no study loaded`
            }
            aria-describedby={helpId}
            onKeyDown={onKeyDown}
            onDragOver={(e) => {
              if (!allowLocalFiles) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`relative ${viewportHeight} select-none overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400`}
          >
            <p id={helpId} className="sr-only">
              Use the mouse wheel or the up and down arrow keys to move through slices, Home and End for the first and last slice.
              Drag with the active tool. Press W, P or Z to choose window-level, pan or zoom, and R to reset the view.
            </p>
            <canvas
              ref={canvasRef}
              aria-hidden
              className={`absolute inset-0 h-full w-full touch-none ${
                tool === "annotate" ? "cursor-crosshair" : tool === "pan" ? "cursor-grab" : tool === "zoom" ? "cursor-zoom-in" : "cursor-ns-resize"
              }`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onContextMenu={(e) => e.preventDefault()}
            />

            {frame && effectiveVoi && (
              <>
                <div aria-hidden className={`${overlay} left-3 top-2`}>
                  {study?.patientName && <div>{study.patientName}</div>}
                  {study?.patientID && <div>ID {study.patientID}</div>}
                  {study?.studyDate && <div>{formatDicomDate(study.studyDate)}</div>}
                </div>
                <div aria-hidden className={`${overlay} right-3 top-2 text-right`}>
                  {study?.studyDescription && <div>{study.studyDescription}</div>}
                  <div>
                    {series?.number !== undefined ? `Se ${series.number} ` : ""}
                    {series?.description ?? ""}
                  </div>
                  {frame.modality && <div>{frame.modality}</div>}
                </div>
                <div aria-hidden className={`${overlay} bottom-2 left-3`}>
                  <div>
                    W {Math.round(effectiveVoi.width)} L {Math.round(effectiveVoi.center)}
                    {invert ? " · INV" : ""}
                  </div>
                  <div>Zoom {Math.round(zoom * 100)}%</div>
                </div>
                <div aria-hidden className={`${overlay} bottom-2 right-3 text-right`}>
                  <div>
                    Im {index + 1}/{count}
                  </div>
                  {framePosition(frame) && <div>{framePosition(frame)}</div>}
                  {frame.sliceThickness !== undefined && <div>Thk {fmt(frame.sliceThickness)} mm</div>}
                </div>
              </>
            )}

            {visibleAnnotations.map((a) => {
              const p = imageToScreen(a.x, a.y);
              if (!p || p.x < 0 || p.y < 0 || p.x > box.w || p.y > box.h) return null;
              const linked = Boolean(a.sop_instance_uid);
              return (
                <div key={a.id} className="group absolute -translate-x-1/2 -translate-y-full" style={{ left: p.x, top: p.y }}>
                  <MapPin
                    size={20}
                    className={`drop-shadow ${linked ? "fill-amber-400 text-amber-600" : "fill-transparent text-amber-300"}`}
                    aria-hidden
                  />
                  <div className="absolute left-1/2 top-full z-10 mt-1 w-max max-w-[220px] -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white opacity-0 shadow-lg transition group-focus-within:opacity-100 group-hover:opacity-100">
                    {a.note}
                    {!linked && <span className="block text-slate-400">Not linked to a specific image</span>}
                    {onRemoveAnnotation && (
                      <button
                        type="button"
                        onClick={() => onRemoveAnnotation(a.id)}
                        className="ml-1.5 inline-flex align-middle text-slate-300 hover:text-white"
                        aria-label={`Remove annotation: ${a.note}`}
                      >
                        <X size={11} aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {pendingPin && frame && (() => {
              const p = imageToScreen(pendingPin.x, pendingPin.y);
              if (!p) return null;
              return (
                <form
                  className="absolute z-20 flex -translate-x-1/2 items-center gap-1 rounded-md bg-white p-1.5 shadow-lg"
                  style={{ left: p.x, top: p.y }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!pendingNote.trim() || !onAddAnnotation) return;
                    onAddAnnotation(pendingPin.x, pendingPin.y, pendingNote.trim(), {
                      sopInstanceUid: frame.sopInstanceUID,
                      frameNumber: frame.numberOfFrames > 1 ? frame.frameIndex + 1 : null,
                    });
                    setPendingPin(null);
                    setPendingNote("");
                    viewportRef.current?.focus();
                  }}
                >
                  <input
                    autoFocus
                    value={pendingNote}
                    onChange={(e) => setPendingNote(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setPendingPin(null)}
                    placeholder="Finding note…"
                    aria-label="Annotation note"
                    className="w-44 rounded border border-slate-300 px-2 py-1 text-xs text-navy"
                  />
                  <button type="submit" className="rounded bg-medical px-2 py-1 text-xs font-semibold text-white">
                    Pin
                  </button>
                  <button type="button" onClick={() => setPendingPin(null)} className="rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Cancel annotation">
                    <X size={13} aria-hidden />
                  </button>
                </form>
              );
            })()}

            {!frame && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                {status.kind === "loading" ? (
                  <div role="status" className="flex flex-col items-center gap-3 text-sm text-slate-300">
                    <Loader2 size={28} className="animate-spin text-sky-400" aria-hidden />
                    {status.total > 0 ? `Loading study… ${status.done} of ${status.total} files` : "Loading study…"}
                  </div>
                ) : (
                  <div className="max-w-md text-center">
                    {status.kind === "error" ? (
                      <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-rose-950/60 p-3 text-left text-sm text-rose-100">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
                        <span>{status.message}</span>
                      </div>
                    ) : null}
                    <p className="text-base font-semibold text-white">No DICOM study loaded</p>
                    <p className="mt-2 text-sm text-slate-400">
                      {allowLocalFiles
                        ? dicomImageUrl
                          ? "Open DICOM files from your computer to review them here. They are not uploaded or attached to the scan."
                          : "No images are attached to this scan yet. You can open DICOM files from your computer to review them here — they are not uploaded or attached to the scan."
                        : "No images are available for this scan."}
                    </p>
                    {allowLocalFiles && (
                      <>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                          >
                            <FileUp size={16} aria-hidden /> Open DICOM files
                          </button>
                          <button
                            type="button"
                            onClick={() => folderInputRef.current?.click()}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                          >
                            <FolderOpen size={16} aria-hidden /> Open folder
                          </button>
                        </div>
                        <p className="mt-3 text-xs text-slate-500">…or drop files or a folder here. Uncompressed grayscale DICOM (Part 10) is supported.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {frame && status.kind === "loading" && (
              <div role="status" className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-slate-200">
                Loading… {status.done} of {status.total} files
              </div>
            )}

            {dragOver && allowLocalFiles && (
              <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-lg border-2 border-dashed border-sky-400 bg-sky-950/60 text-sm font-semibold text-sky-100">
                Drop DICOM files to open them
              </div>
            )}
          </div>

          {/* Slice navigation */}
          <div className="flex items-center gap-1 border-t border-slate-800 px-2 py-1.5">
            <ToolbarButton label="First slice" disabled={count < 2 || index === 0} onClick={() => goTo(0)}>
              <ChevronsLeft size={16} aria-hidden />
            </ToolbarButton>
            <ToolbarButton label="Previous slice" disabled={count < 2 || index === 0} onClick={() => step(-1)}>
              <ChevronLeft size={16} aria-hidden />
            </ToolbarButton>
            <input
              type="range"
              min={1}
              max={Math.max(1, count)}
              step={1}
              value={count ? index + 1 : 1}
              disabled={count < 2}
              onChange={(e) => goTo(Number(e.target.value) - 1)}
              aria-label="Slice"
              aria-valuetext={count ? `Slice ${index + 1} of ${count}` : "No slices"}
              className="mx-1 h-2 min-w-0 flex-1 cursor-pointer accent-sky-500 disabled:cursor-not-allowed"
            />
            <ToolbarButton label="Next slice" disabled={count < 2 || index === count - 1} onClick={() => step(1)}>
              <ChevronRight size={16} aria-hidden />
            </ToolbarButton>
            <ToolbarButton label="Last slice" disabled={count < 2 || index === count - 1} onClick={() => goTo(count - 1)}>
              <ChevronsRight size={16} aria-hidden />
            </ToolbarButton>
            <span aria-live="polite" aria-atomic className="w-32 shrink-0 text-right font-mono text-xs text-slate-300" data-testid="slice-position">
              {count ? `Slice ${index + 1} of ${count}` : "No slices"}
            </span>
          </div>
        </div>

        {/* Study panel */}
        <aside aria-label="Study information" className="w-full shrink-0 overflow-y-auto border-t border-slate-800 text-xs xl:w-72 xl:border-l xl:border-t-0">
          <div className="border-b border-slate-800 p-3">
            <p className="font-semibold text-white">{bodyPart}</p>
            <p className="mt-0.5 text-slate-400">
              {[meta?.protocol, meta?.machine].filter(Boolean).join(" · ") || "Scan details unavailable"}
            </p>
            {source && (
              <p className="mt-1.5 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300">
                {source === "stored" ? "Images stored with this scan" : "Opened from this computer — not attached to the scan"}
              </p>
            )}
          </div>

          {study && (
            <div className="border-b border-slate-800 p-3">
              <p className="mb-2 font-semibold uppercase tracking-wide text-slate-400">Series ({study.series.length})</p>
              <ul className="space-y-1">
                {study.series.map((s, i) => (
                  <li key={s.uid}>
                    <button
                      type="button"
                      onClick={() => {
                        setSeriesIndex(i);
                        setSliceIndex(0);
                        setVoi(null);
                        setPendingPin(null);
                      }}
                      aria-pressed={i === seriesIndex}
                      className={`flex w-full items-center gap-2 rounded-md p-1.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
                        i === seriesIndex ? "bg-sky-900/60 text-white" : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {seriesThumbs[i] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={seriesThumbs[i]!} alt="" className="h-10 w-10 shrink-0 rounded bg-black object-contain" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {s.number !== undefined ? `#${s.number} ` : ""}
                          {s.description ?? "Unnamed series"}
                        </span>
                        <span className="text-slate-400">
                          {s.modality ?? "—"} · {s.frames.length} {s.frames.length === 1 ? "image" : "images"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {frame && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 p-3">
              {metadata
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="break-words text-slate-100">{v}</dd>
                  </React.Fragment>
                ))}
            </dl>
          )}

          {skipped.length > 0 && (
            <details className="border-t border-slate-800 p-3">
              <summary className="cursor-pointer font-semibold text-amber-300">
                {skipped.length} {skipped.length === 1 ? "file" : "files"} skipped
              </summary>
              <ul className="mt-2 space-y-1.5">
                {skipped.map((s) => (
                  <li key={s.name}>
                    <span className="block break-all text-slate-200">{s.name}</span>
                    <span className="text-slate-400">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </div>

      <p className="border-t border-slate-800 px-3 py-1.5 text-[11px] text-slate-500">
        Review viewer for uncompressed grayscale DICOM. It has not been validated for primary diagnosis.
      </p>
    </div>
  );
}
