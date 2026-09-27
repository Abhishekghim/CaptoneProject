import dicomParser from "dicom-parser";

export type DicomErrorCode =
  | "not-dicom"
  | "unsupported-transfer-syntax"
  | "no-pixel-data"
  | "unsupported-pixel-format"
  | "truncated";

export class DicomLoadError extends Error {
  constructor(public readonly code: DicomErrorCode, message: string) {
    super(message);
    this.name = "DicomLoadError";
  }
}

export type StoredPixels = Int16Array | Uint16Array | Int8Array | Uint8Array;

/** One displayable 2D image — a single-frame instance, or one frame of a multi-frame instance. */
export interface DicomFrame {
  key: string;
  fileName: string;
  sopInstanceUID: string;
  /** 0-based index within its instance (always 0 for single-frame files). */
  frameIndex: number;
  numberOfFrames: number;
  rows: number;
  columns: number;
  pixels: StoredPixels;
  rescaleSlope: number;
  rescaleIntercept: number;
  /** Modality-value range of this frame (after rescale). */
  minValue: number;
  maxValue: number;
  windowCenter?: number;
  windowWidth?: number;
  /** MONOCHROME1: lowest values display as white. */
  monochrome1: boolean;
  /** Row spacing, column spacing in mm. */
  pixelSpacing?: [number, number];
  sliceThickness?: number;
  sliceLocation?: number;
  instanceNumber?: number;
  imagePosition?: [number, number, number];
  imageOrientation?: [number, number, number, number, number, number];
  seriesInstanceUID: string;
  seriesNumber?: number;
  seriesDescription?: string;
  studyInstanceUID?: string;
  studyDescription?: string;
  studyDate?: string;
  patientName?: string;
  patientID?: string;
  modality?: string;
  bodyPartExamined?: string;
  repetitionTime?: number;
  echoTime?: number;
  magneticFieldStrength?: number;
  transferSyntaxUID: string;
}

const UNCOMPRESSED: Record<string, string> = {
  "1.2.840.10008.1.2": "Implicit VR Little Endian",
  "1.2.840.10008.1.2.1": "Explicit VR Little Endian",
  "1.2.840.10008.1.2.2": "Explicit VR Big Endian",
};

const KNOWN_COMPRESSED: Record<string, string> = {
  "1.2.840.10008.1.2.1.99": "Deflated Explicit VR Little Endian",
  "1.2.840.10008.1.2.4.50": "JPEG Baseline",
  "1.2.840.10008.1.2.4.51": "JPEG Extended",
  "1.2.840.10008.1.2.4.57": "JPEG Lossless",
  "1.2.840.10008.1.2.4.70": "JPEG Lossless (SV1)",
  "1.2.840.10008.1.2.4.80": "JPEG-LS Lossless",
  "1.2.840.10008.1.2.4.81": "JPEG-LS Near-Lossless",
  "1.2.840.10008.1.2.4.90": "JPEG 2000 Lossless",
  "1.2.840.10008.1.2.4.91": "JPEG 2000",
  "1.2.840.10008.1.2.4.201": "HTJ2K Lossless",
  "1.2.840.10008.1.2.4.202": "HTJ2K Lossless RPCL",
  "1.2.840.10008.1.2.4.203": "HTJ2K",
  "1.2.840.10008.1.2.5": "RLE Lossless",
};

export function transferSyntaxName(uid: string): string {
  return UNCOMPRESSED[uid] ?? KNOWN_COMPRESSED[uid] ?? uid;
}

/** Quick check for the Part 10 "DICM" marker without parsing the whole file. */
export function hasDicomPreamble(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 132) return false;
  const v = new Uint8Array(bytes, 128, 4);
  return v[0] === 0x44 && v[1] === 0x49 && v[2] === 0x43 && v[3] === 0x4d;
}

function numbers<N extends number>(ds: dicomParser.DataSet, tag: string, count: N): number[] | undefined {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const v = ds.floatString(tag, i);
    if (v === undefined || !Number.isFinite(v)) return undefined;
    values.push(v);
  }
  return values;
}

function finite(v: number | undefined): number | undefined {
  return v !== undefined && Number.isFinite(v) ? v : undefined;
}

function personName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.split("=")[0].split("^").filter(Boolean).join(" ").trim();
  return cleaned || undefined;
}

/**
 * Parses one DICOM Part 10 file into its displayable frames. Supports
 * uncompressed grayscale pixel data (8/16-bit, signed or unsigned,
 * MONOCHROME1/2, single- or multi-frame). Anything else throws a
 * DicomLoadError naming the reason, so callers can report it per file.
 */
export function parseDicomFile(buffer: ArrayBuffer, fileName: string): DicomFrame[] {
  if (!hasDicomPreamble(buffer)) {
    throw new DicomLoadError("not-dicom", "Not a DICOM file (no DICM marker).");
  }
  let ds: dicomParser.DataSet;
  try {
    ds = dicomParser.parseDicom(new Uint8Array(buffer));
  } catch (e) {
    throw new DicomLoadError("not-dicom", `Could not read DICOM structure: ${e instanceof Error ? e.message : String(e)}`);
  }

  const transferSyntaxUID = ds.string("x00020010") ?? "1.2.840.10008.1.2";
  if (!UNCOMPRESSED[transferSyntaxUID]) {
    throw new DicomLoadError(
      "unsupported-transfer-syntax",
      `Compressed pixel data (${transferSyntaxName(transferSyntaxUID)}) isn't supported by this viewer.`
    );
  }

  const pixelElement = ds.elements.x7fe00010;
  const rows = ds.uint16("x00280010");
  const columns = ds.uint16("x00280011");
  if (!pixelElement || !rows || !columns) {
    throw new DicomLoadError("no-pixel-data", "Contains no image data (for example a DICOMDIR or report).");
  }

  const samplesPerPixel = ds.uint16("x00280002") ?? 1;
  const photometric = (ds.string("x00280004") ?? "MONOCHROME2").toUpperCase();
  if (samplesPerPixel !== 1 || (photometric !== "MONOCHROME1" && photometric !== "MONOCHROME2")) {
    throw new DicomLoadError("unsupported-pixel-format", `Colour images (${photometric}) aren't supported by this viewer.`);
  }
  const bitsAllocated = ds.uint16("x00280100") ?? 16;
  if (bitsAllocated !== 8 && bitsAllocated !== 16) {
    throw new DicomLoadError("unsupported-pixel-format", `${bitsAllocated}-bit pixel data isn't supported by this viewer.`);
  }
  const bitsStored = ds.uint16("x00280101") ?? bitsAllocated;
  const signed = ds.uint16("x00280103") === 1;
  const numberOfFrames = Math.max(1, ds.intString("x00280008") ?? 1);
  const bytesPerSample = bitsAllocated / 8;
  const frameBytes = rows * columns * bytesPerSample;
  if (pixelElement.length < frameBytes * numberOfFrames) {
    throw new DicomLoadError("truncated", "Pixel data is shorter than the image size in its header.");
  }
  const bigEndian = transferSyntaxUID === "1.2.840.10008.1.2.2";

  const rescaleSlope = finite(ds.floatString("x00281053")) ?? 1;
  const rescaleIntercept = finite(ds.floatString("x00281052")) ?? 0;
  const spacing = numbers(ds, "x00280030", 2) as [number, number] | undefined;
  const position = numbers(ds, "x00200032", 3) as [number, number, number] | undefined;
  const orientation = numbers(ds, "x00200037", 6) as DicomFrame["imageOrientation"];
  const sopInstanceUID = ds.string("x00080018") ?? `${fileName}`;
  const windowWidth = finite(ds.floatString("x00281051", 0));

  const common = {
    fileName,
    sopInstanceUID,
    numberOfFrames,
    rows,
    columns,
    rescaleSlope,
    rescaleIntercept,
    windowCenter: finite(ds.floatString("x00281050", 0)),
    windowWidth: windowWidth !== undefined && windowWidth > 0 ? windowWidth : undefined,
    monochrome1: photometric === "MONOCHROME1",
    pixelSpacing: spacing && spacing[0] > 0 && spacing[1] > 0 ? spacing : undefined,
    sliceThickness: finite(ds.floatString("x00180050")),
    sliceLocation: finite(ds.floatString("x00201041")),
    instanceNumber: ds.intString("x00200013"),
    imagePosition: position,
    imageOrientation: orientation,
    seriesInstanceUID: ds.string("x0020000e") ?? "unknown-series",
    seriesNumber: ds.intString("x00200011"),
    seriesDescription: ds.string("x0008103e"),
    studyInstanceUID: ds.string("x0020000d"),
    studyDescription: ds.string("x00081030"),
    studyDate: ds.string("x00080020"),
    patientName: personName(ds.string("x00100010")),
    patientID: ds.string("x00100020"),
    modality: ds.string("x00080060"),
    bodyPartExamined: ds.string("x00180015"),
    repetitionTime: finite(ds.floatString("x00180080")),
    echoTime: finite(ds.floatString("x00180081")),
    magneticFieldStrength: finite(ds.floatString("x00180087")),
    transferSyntaxUID,
  };

  const frames: DicomFrame[] = [];
  for (let f = 0; f < numberOfFrames; f++) {
    const start = pixelElement.dataOffset + f * frameBytes;
    // A copy is both correctly aligned for typed-array views and lets the
    // (much larger) file buffer be garbage-collected.
    const raw = buffer.slice(start, start + frameBytes);
    if (bigEndian && bytesPerSample === 2) {
      const b = new Uint8Array(raw);
      for (let i = 0; i < b.length; i += 2) {
        const t = b[i];
        b[i] = b[i + 1];
        b[i + 1] = t;
      }
    }
    let pixels: StoredPixels;
    if (bytesPerSample === 2) pixels = signed ? new Int16Array(raw) : new Uint16Array(raw);
    else pixels = signed ? new Int8Array(raw) : new Uint8Array(raw);

    // Signed data stored in fewer bits than allocated needs sign extension
    // (JS bitwise ops are 32-bit, hence 32 - bitsStored).
    if (signed && bitsStored < bitsAllocated) {
      const shift = 32 - bitsStored;
      for (let i = 0; i < pixels.length; i++) pixels[i] = (pixels[i] << shift) >> shift;
    } else if (!signed && bitsStored < bitsAllocated) {
      const mask = (1 << bitsStored) - 1;
      for (let i = 0; i < pixels.length; i++) pixels[i] &= mask;
    }

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < pixels.length; i++) {
      const v = pixels[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const a = min * rescaleSlope + rescaleIntercept;
    const b = max * rescaleSlope + rescaleIntercept;

    frames.push({
      ...common,
      key: `${sopInstanceUID}#${f}`,
      frameIndex: f,
      pixels,
      minValue: Math.min(a, b),
      maxValue: Math.max(a, b),
    });
  }
  return frames;
}
