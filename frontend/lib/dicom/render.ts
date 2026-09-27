import type { DicomFrame } from "./parse";

export interface VoiWindow {
  center: number;
  width: number;
}

/** The frame's own window (from its header), or its full value range when it has none. */
export function defaultWindow(frame: DicomFrame): VoiWindow {
  if (frame.windowCenter !== undefined && frame.windowWidth !== undefined) {
    return { center: frame.windowCenter, width: frame.windowWidth };
  }
  return fullRangeWindow(frame);
}

export function fullRangeWindow(frame: DicomFrame): VoiWindow {
  return { center: (frame.minValue + frame.maxValue) / 2, width: Math.max(1, frame.maxValue - frame.minValue) };
}

/**
 * The DICOM linear VOI function (PS3.3 C.11.2.1.2.1), mapping a modality
 * value to an 8-bit display value.
 */
export function voiLinear(x: number, center: number, width: number): number {
  const w = Math.max(1, width);
  const c = center - 0.5;
  const halfSpan = (w - 1) / 2;
  if (x <= c - halfSpan) return 0;
  if (x > c + halfSpan) return 255;
  return ((x - c) / (w - 1) + 0.5) * 255;
}

/** Writes the frame as grayscale RGBA into `out` (length rows*columns*4). */
export function renderFrameToRgba(frame: DicomFrame, voi: VoiWindow, invert: boolean, out: Uint8ClampedArray) {
  const { pixels, rescaleSlope: m, rescaleIntercept: b } = frame;
  const flip = invert !== frame.monochrome1;
  const w = Math.max(1, voi.width);
  const c = voi.center - 0.5;
  const lo = c - (w - 1) / 2;
  const hi = c + (w - 1) / 2;
  const scale = w > 1 ? 255 / (w - 1) : 0;
  for (let i = 0, o = 0; i < pixels.length; i++, o += 4) {
    const x = pixels[i] * m + b;
    let v: number;
    if (x <= lo) v = 0;
    else if (x > hi) v = 255;
    else v = (x - c) * scale + 127.5;
    if (flip) v = 255 - v;
    out[o] = v;
    out[o + 1] = v;
    out[o + 2] = v;
    out[o + 3] = 255;
  }
}
