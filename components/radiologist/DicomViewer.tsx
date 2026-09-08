"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Contrast, MapPin, Move, RotateCcw, Sun, X, ZoomIn, ZoomOut } from "lucide-react";
import type { ImageAnnotation } from "@/lib/types";

/**
 * Local Canvas "DICOM viewer" simulator.
 *
 * Renders a deterministic, procedurally generated grayscale MR-style image
 * (seeded per scan id, varying by body part) to an offscreen canvas, then
 * window/levels it onto the visible canvas with:
 *   - zoom (wheel or buttons) and pan (drag)
 *   - brightness (window level) and contrast (window width) sliders
 *   - grayscale inversion and one-click reset
 *
 * In production the offscreen source would be a decoded DICOM frame
 * (e.g. via cornerstone.js); the window/level pipeline below is identical.
 */

const SIZE = 512;

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Paints a synthetic axial slice: outer tissue ellipse, inner structures, noise. */
function paintSyntheticSlice(ctx: CanvasRenderingContext2D, seedKey: string, bodyPart: string) {
  const rand = mulberry32(hashString(seedKey));
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const isBrain = /brain/i.test(bodyPart);
  const isSpine = /spine/i.test(bodyPart);

  // Outer anatomy envelope
  const grad = ctx.createRadialGradient(cx, cy, 40, cx, cy, 210);
  grad.addColorStop(0, "rgb(150,150,150)");
  grad.addColorStop(0.75, "rgb(105,105,105)");
  grad.addColorStop(1, "rgb(18,18,18)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, isSpine ? 150 : 200, isBrain ? 230 : 180, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bright cortical rim
  ctx.strokeStyle = "rgb(210,210,210)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(cx, cy, isSpine ? 150 : 200, isBrain ? 230 : 180, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Internal structures — blobs of varying intensity
  const blobCount = 14 + Math.floor(rand() * 8);
  for (let i = 0; i < blobCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * 130;
    const bx = cx + Math.cos(angle) * dist;
    const by = cy + Math.sin(angle) * dist * (isBrain ? 1.15 : 0.85);
    const r = 8 + rand() * 34;
    const v = 40 + Math.floor(rand() * 190);
    const g = ctx.createRadialGradient(bx, by, 1, bx, by, r);
    g.addColorStop(0, `rgba(${v},${v},${v},0.9)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Midline / vertebral column hint for spine studies
  if (isSpine) {
    ctx.fillStyle = "rgb(195,195,195)";
    for (let y = cy - 160; y < cy + 160; y += 34) {
      ctx.beginPath();
      ctx.roundRect(cx - 22, y, 44, 24, 6);
      ctx.fill();
      ctx.fillStyle = "rgb(70,70,70)";
      ctx.fillRect(cx - 16, y + 24, 32, 8); // disc space
      ctx.fillStyle = "rgb(195,195,195)";
    }
  }

  // Ventricles for brain studies
  if (isBrain) {
    ctx.fillStyle = "rgb(25,25,25)";
    ctx.beginPath();
    ctx.ellipse(cx - 28, cy - 10, 20, 52, -0.25, 0, Math.PI * 2);
    ctx.ellipse(cx + 28, cy - 10, 20, 52, 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  // Acquisition noise
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 26;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = d[i];
    d[i + 2] = d[i];
  }
  ctx.putImageData(img, 0, 0);
}

export interface DicomViewerProps {
  scanId: string;
  bodyPart: string;
  meta?: { protocol?: string; machine?: string; performedAt?: string };
  annotations?: ImageAnnotation[];
  onAddAnnotation?: (x: number, y: number, note: string) => void;
  onRemoveAnnotation?: (id: string) => void;
  canAnnotate?: boolean;
}

export default function DicomViewer({
  scanId, bodyPart, meta, annotations = [], onAddAnnotation, onRemoveAnnotation, canAnnotate = false,
}: DicomViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [brightness, setBrightness] = useState(0); // -100 … 100
  const [contrast, setContrast] = useState(0); // -100 … 100
  const [invert, setInvert] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const [annotateMode, setAnnotateMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [pendingNote, setPendingNote] = useState("");

  const toImagePoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleFactor = SIZE / rect.width;
      const canvasPxX = (clientX - rect.left) * scaleFactor;
      const canvasPxY = (clientY - rect.top) * scaleFactor;
      return {
        x: (canvasPxX - SIZE / 2 - pan.x) / zoom + SIZE / 2,
        y: (canvasPxY - SIZE / 2 - pan.y) / zoom + SIZE / 2,
      };
    },
    [pan, zoom]
  );

  const toScreenPercent = useCallback(
    (x: number, y: number) => {
      const canvasPxX = SIZE / 2 + pan.x + (x - SIZE / 2) * zoom;
      const canvasPxY = SIZE / 2 + pan.y + (y - SIZE / 2) * zoom;
      return { leftPct: (canvasPxX / SIZE) * 100, topPct: (canvasPxY / SIZE) * 100 };
    },
    [pan, zoom]
  );

  // Build the source slice once per scan
  const sourceKey = useMemo(() => `${scanId}:${bodyPart}`, [scanId, bodyPart]);
  useEffect(() => {
    const off = document.createElement("canvas");
    off.width = SIZE;
    off.height = SIZE;
    const ctx = off.getContext("2d")!;
    paintSyntheticSlice(ctx, sourceKey, bodyPart);
    sourceRef.current = off;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setBrightness(0);
    setContrast(0);
    setInvert(false);
    setAnnotateMode(false);
    setPendingPin(null);
  }, [sourceKey, bodyPart]);

  // Render pipeline: draw source with transform, then apply window/level per-pixel
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    if (!canvas || !source) return;
    const ctx = canvas.getContext("2d")!;

    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.drawImage(source, -SIZE / 2, -SIZE / 2);
    ctx.restore();

    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = frame.data;
    const b = (brightness / 100) * 128;
    const cFactor = (259 * (contrast * 1.28 + 255)) / (255 * (259 - contrast * 1.28));
    for (let i = 0; i < d.length; i += 4) {
      let v = d[i];
      v = cFactor * (v - 128) + 128 + b;
      if (invert) v = 255 - v;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
    ctx.putImageData(frame, 0, 0);
  }, [zoom, pan, brightness, contrast, invert]);

  useEffect(() => {
    const id = requestAnimationFrame(render);
    return () => cancelAnimationFrame(id);
  }, [render]);

  // Pointer pan (or, in annotate mode, drop a pin instead of panning)
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (annotateMode) {
      const point = toImagePoint(e.clientX, e.clientY);
      setPendingPin(point);
      setPendingNote("");
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    setPan({
      x: dragRef.current.panX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.panY + (e.clientY - dragRef.current.startY),
    });
  }
  function onPointerUp() {
    dragRef.current = null;
  }
  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    setZoom((z) => Math.min(6, Math.max(0.4, z * (e.deltaY < 0 ? 1.1 : 0.9))));
  }

  function reset() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setBrightness(0);
    setContrast(0);
    setInvert(false);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-navy">
      {/* Overlay header (classic PACS corner text) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 font-mono text-[11px] text-emerald-400">
        <span>PT STUDY · {bodyPart.toUpperCase()} · MR</span>
        <span>{meta?.machine ?? "MRI Suite"} · {meta?.protocol ?? "Standard protocol"}</span>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          role="img"
          aria-label={`Simulated ${bodyPart} MRI slice. Drag to pan, scroll to zoom.`}
          className={`mx-auto block h-auto w-full max-w-[512px] touch-none select-none ${
            annotateMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        />
        <span className="pointer-events-none absolute bottom-2 left-3 font-mono text-[11px] text-emerald-400">
          Z {zoom.toFixed(2)}x · W {(100 + contrast).toFixed(0)} L {(brightness + 100).toFixed(0)}
        </span>
        <span className="pointer-events-none absolute bottom-2 right-3 inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
          <Move size={11} aria-hidden /> {annotateMode ? "click to pin a finding" : "drag to pan"}
        </span>

        {annotations.map((a) => {
          const { leftPct, topPct } = toScreenPercent(a.x, a.y);
          if (leftPct < 0 || leftPct > 100 || topPct < 0 || topPct > 100) return null;
          return (
            <div
              key={a.id}
              className="group absolute -translate-x-1/2 -translate-y-full"
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            >
              <MapPin size={20} className="fill-amber-400 text-amber-600 drop-shadow" aria-hidden />
              <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 w-max max-w-[200px] -translate-x-1/2 rounded-md bg-navy px-2 py-1 text-[11px] text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                {a.note}
                {onRemoveAnnotation && (
                  <button
                    type="button"
                    onClick={() => onRemoveAnnotation(a.id)}
                    className="pointer-events-auto ml-1.5 inline-flex align-middle text-slate-300 hover:text-white"
                    aria-label="Remove annotation"
                  >
                    <X size={11} aria-hidden />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {pendingPin && (
          <form
            className="absolute z-20 flex -translate-x-1/2 items-center gap-1 rounded-md bg-white p-1.5 shadow-lg"
            style={{ left: `${toScreenPercent(pendingPin.x, pendingPin.y).leftPct}%`, top: `${toScreenPercent(pendingPin.x, pendingPin.y).topPct}%` }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!pendingNote.trim() || !onAddAnnotation) return;
              onAddAnnotation(pendingPin.x, pendingPin.y, pendingNote.trim());
              setPendingPin(null);
              setPendingNote("");
            }}
          >
            <input
              autoFocus
              value={pendingNote}
              onChange={(e) => setPendingNote(e.target.value)}
              placeholder="Finding note…"
              className="w-40 rounded border border-slate-300 px-2 py-1 text-xs text-navy"
            />
            <button type="submit" className="rounded bg-medical px-2 py-1 text-xs font-semibold text-white">Pin</button>
            <button type="button" onClick={() => setPendingPin(null)} className="rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Cancel">
              <X size={13} aria-hidden />
            </button>
          </form>
        )}
      </div>

      {/* Controls */}
      <div className="grid gap-3 border-t border-slate-700 p-4 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setZoom((z) => Math.min(6, z * 1.2))} className="rounded-lg bg-slate-800 p-2 text-slate-200 transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical" aria-label="Zoom in">
            <ZoomIn size={16} aria-hidden />
          </button>
          <button type="button" onClick={() => setZoom((z) => Math.max(0.4, z / 1.2))} className="rounded-lg bg-slate-800 p-2 text-slate-200 transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical" aria-label="Zoom out">
            <ZoomOut size={16} aria-hidden />
          </button>
          <button type="button" onClick={() => setInvert((v) => !v)} aria-pressed={invert} className={`rounded-lg p-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical ${invert ? "bg-medical text-white" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`} aria-label="Invert grayscale">
            <Contrast size={16} aria-hidden />
          </button>
          <button type="button" onClick={reset} className="rounded-lg bg-slate-800 p-2 text-slate-200 transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical" aria-label="Reset view">
            <RotateCcw size={16} aria-hidden />
          </button>
          {canAnnotate && (
            <button
              type="button"
              onClick={() => { setAnnotateMode((v) => !v); setPendingPin(null); }}
              aria-pressed={annotateMode}
              className={`rounded-lg p-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical ${
                annotateMode ? "bg-amber-500 text-navy" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
              aria-label="Toggle annotation mode"
            >
              <MapPin size={16} aria-hidden />
            </button>
          )}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Sun size={13} aria-hidden />
            Brightness
            <input
              type="range" min={-100} max={100} value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="flex-1 accent-sky-500"
              aria-valuetext={`${brightness}`}
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Contrast size={13} aria-hidden />
            Contrast
            <input
              type="range" min={-90} max={90} value={contrast}
              onChange={(e) => setContrast(Number(e.target.value))}
              className="flex-1 accent-sky-500"
              aria-valuetext={`${contrast}`}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
