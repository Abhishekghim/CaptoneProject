// Test-only encoder for minimal DICOM Part 10 files (tiny synthetic pixel
// grids), so parsing and viewer behaviour can be tested against real byte
// streams without shipping any image data.

const IMPLICIT_LE = "1.2.840.10008.1.2";
const LONG_LENGTH_VRS = new Set(["OB", "OW", "OF", "SQ", "UT", "UN"]);

export interface FixtureOptions {
  rows?: number;
  columns?: number;
  pixels?: number[];
  bitsAllocated?: 8 | 16;
  bitsStored?: number;
  signed?: boolean;
  frames?: number;
  transferSyntax?: string;
  photometric?: string;
  samplesPerPixel?: number;
  sopInstanceUID?: string;
  seriesInstanceUID?: string;
  seriesNumber?: number;
  seriesDescription?: string;
  instanceNumber?: number;
  sliceLocation?: number;
  imagePosition?: [number, number, number];
  imageOrientation?: [number, number, number, number, number, number];
  pixelSpacing?: [number, number];
  windowCenter?: number;
  windowWidth?: number;
  rescaleSlope?: number;
  rescaleIntercept?: number;
  patientName?: string;
  patientID?: string;
  modality?: string;
  omitPixelData?: boolean;
}

type Element = { group: number; element: number; vr: string; value: Uint8Array };

const enc = new TextEncoder();

function text(value: string, pad = " "): Uint8Array {
  const s = value.length % 2 ? value + pad : value;
  return enc.encode(s);
}
const ui = (v: string) => text(v, "\0");
const ds = (...values: number[]) => text(values.join("\\"));
function u16(v: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, true);
  return b;
}
function u32(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v, true);
  return b;
}

function encode(elements: Element[], explicit: boolean): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const el of [...elements].sort((a, b) => a.group - b.group || a.element - b.element)) {
    parts.push(u16(el.group), u16(el.element));
    if (explicit) {
      parts.push(enc.encode(el.vr));
      if (LONG_LENGTH_VRS.has(el.vr)) parts.push(new Uint8Array(2), u32(el.value.length));
      else parts.push(u16(el.value.length));
    } else {
      parts.push(u32(el.value.length));
    }
    parts.push(el.value);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function makeDicom(opts: FixtureOptions = {}): ArrayBuffer {
  const rows = opts.rows ?? 4;
  const columns = opts.columns ?? 4;
  const bits = opts.bitsAllocated ?? 16;
  const frames = opts.frames ?? 1;
  const ts = opts.transferSyntax ?? "1.2.840.10008.1.2.1";
  const sop = opts.sopInstanceUID ?? `1.2.826.0.1.99.${Math.floor(Math.random() * 1e9)}`;
  const spp = opts.samplesPerPixel ?? 1;
  const count = rows * columns * frames * spp;
  const pixels = opts.pixels ?? Array.from({ length: count }, (_, i) => i * 10);

  const meta = encode(
    [
      { group: 2, element: 1, vr: "OB", value: new Uint8Array([0, 1]) },
      { group: 2, element: 2, vr: "UI", value: ui("1.2.840.10008.5.1.4.1.1.4") },
      { group: 2, element: 3, vr: "UI", value: ui(sop) },
      { group: 2, element: 0x10, vr: "UI", value: ui(ts) },
      { group: 2, element: 0x12, vr: "UI", value: ui("1.2.826.0.1.99.1") },
    ],
    true
  );
  const groupLength = encode([{ group: 2, element: 0, vr: "UL", value: u32(meta.length) }], true);

  const els: Element[] = [
    { group: 8, element: 0x16, vr: "UI", value: ui("1.2.840.10008.5.1.4.1.1.4") },
    { group: 8, element: 0x18, vr: "UI", value: ui(sop) },
    { group: 8, element: 0x60, vr: "CS", value: text(opts.modality ?? "MR") },
    { group: 0x10, element: 0x10, vr: "PN", value: text(opts.patientName ?? "TEST^PATIENT") },
    { group: 0x10, element: 0x20, vr: "LO", value: text(opts.patientID ?? "T-0001") },
    { group: 0x20, element: 0x0d, vr: "UI", value: ui("1.2.826.0.1.99.100") },
    { group: 0x20, element: 0x0e, vr: "UI", value: ui(opts.seriesInstanceUID ?? "1.2.826.0.1.99.200") },
    { group: 0x20, element: 0x11, vr: "IS", value: text(String(opts.seriesNumber ?? 1)) },
    { group: 0x28, element: 0x02, vr: "US", value: u16(spp) },
    { group: 0x28, element: 0x04, vr: "CS", value: text(opts.photometric ?? "MONOCHROME2") },
    { group: 0x28, element: 0x10, vr: "US", value: u16(rows) },
    { group: 0x28, element: 0x11, vr: "US", value: u16(columns) },
    { group: 0x28, element: 0x100, vr: "US", value: u16(bits) },
    { group: 0x28, element: 0x101, vr: "US", value: u16(opts.bitsStored ?? bits) },
    { group: 0x28, element: 0x102, vr: "US", value: u16((opts.bitsStored ?? bits) - 1) },
    { group: 0x28, element: 0x103, vr: "US", value: u16(opts.signed ? 1 : 0) },
  ];
  const add = (group: number, element: number, vr: string, value: Uint8Array | undefined) => {
    if (value) els.push({ group, element, vr, value });
  };
  add(0x08, 0x103e, "LO", opts.seriesDescription !== undefined ? text(opts.seriesDescription) : undefined);
  add(0x20, 0x13, "IS", opts.instanceNumber !== undefined ? text(String(opts.instanceNumber)) : undefined);
  add(0x20, 0x32, "DS", opts.imagePosition ? ds(...opts.imagePosition) : undefined);
  add(0x20, 0x37, "DS", opts.imageOrientation ? ds(...opts.imageOrientation) : undefined);
  add(0x20, 0x1041, "DS", opts.sliceLocation !== undefined ? ds(opts.sliceLocation) : undefined);
  add(0x28, 0x08, "IS", frames > 1 ? text(String(frames)) : undefined);
  add(0x28, 0x30, "DS", opts.pixelSpacing ? ds(...opts.pixelSpacing) : undefined);
  add(0x28, 0x1050, "DS", opts.windowCenter !== undefined ? ds(opts.windowCenter) : undefined);
  add(0x28, 0x1051, "DS", opts.windowWidth !== undefined ? ds(opts.windowWidth) : undefined);
  add(0x28, 0x1052, "DS", opts.rescaleIntercept !== undefined ? ds(opts.rescaleIntercept) : undefined);
  add(0x28, 0x1053, "DS", opts.rescaleSlope !== undefined ? ds(opts.rescaleSlope) : undefined);

  if (!opts.omitPixelData) {
    const bytes = new Uint8Array(pixels.length * (bits / 8) + ((pixels.length * (bits / 8)) % 2));
    const view = new DataView(bytes.buffer);
    pixels.forEach((v, i) => {
      if (bits === 16) {
        if (opts.signed) view.setInt16(i * 2, v, true);
        else view.setUint16(i * 2, v, true);
      } else {
        view.setUint8(i, v & 0xff);
      }
    });
    els.push({ group: 0x7fe0, element: 0x10, vr: bits === 16 ? "OW" : "OB", value: bytes });
  }

  const dataset = encode(els, ts !== IMPLICIT_LE);
  const out = new Uint8Array(132 + groupLength.length + meta.length + dataset.length);
  out.set(enc.encode("DICM"), 128);
  out.set(groupLength, 132);
  out.set(meta, 132 + groupLength.length);
  out.set(dataset, 132 + groupLength.length + meta.length);
  return out.buffer;
}
