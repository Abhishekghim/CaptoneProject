import { describe, expect, it, vi } from "vitest";
import { makeDicom } from "@/test/dicomFixture";
import { DicomLoadError, parseDicomFile } from "./parse";
import { buildStudy, sortFrames } from "./study";
import { defaultWindow, renderFrameToRgba, voiLinear } from "./render";
import { clampSlice, createWheelStepper } from "./navigation";
import { loadStudy, type DicomSource } from "./load";

function codeOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e instanceof DicomLoadError ? e.code : `other: ${String(e)}`;
  }
  return "no error";
}

const AXIAL: [number, number, number, number, number, number] = [1, 0, 0, 0, 1, 0];

describe("parseDicomFile", () => {
  it("reads geometry, pixels, window and identifying metadata", () => {
    const [frame] = parseDicomFile(
      makeDicom({
        rows: 2,
        columns: 3,
        pixels: [0, 10, 20, 30, 40, 50],
        windowCenter: 40,
        windowWidth: 80,
        pixelSpacing: [0.5, 0.8],
        patientName: "DOE^JANE",
        seriesDescription: "AX T2",
        instanceNumber: 7,
      }),
      "a.dcm"
    );
    expect(frame.rows).toBe(2);
    expect(frame.columns).toBe(3);
    expect(Array.from(frame.pixels)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(frame.windowCenter).toBe(40);
    expect(frame.windowWidth).toBe(80);
    expect(frame.pixelSpacing).toEqual([0.5, 0.8]);
    expect(frame.patientName).toBe("DOE JANE");
    expect(frame.seriesDescription).toBe("AX T2");
    expect(frame.instanceNumber).toBe(7);
    expect(frame.modality).toBe("MR");
  });

  it("applies rescale slope/intercept to the value range and keeps signed data", () => {
    const [frame] = parseDicomFile(
      makeDicom({ rows: 1, columns: 3, pixels: [-100, 0, 100], signed: true, rescaleSlope: 2, rescaleIntercept: -5 }),
      "s.dcm"
    );
    expect(Array.from(frame.pixels)).toEqual([-100, 0, 100]);
    expect(frame.minValue).toBe(-205);
    expect(frame.maxValue).toBe(195);
  });

  it("sign-extends signed values stored in fewer bits than allocated", () => {
    // -1 stored in 12 bits is 0x0FFF.
    const [frame] = parseDicomFile(makeDicom({ rows: 1, columns: 2, pixels: [0x0fff, 5], signed: true, bitsStored: 12 }), "x.dcm");
    expect(Array.from(frame.pixels)).toEqual([-1, 5]);
  });

  it("splits multi-frame instances into ordered frames", () => {
    const frames = parseDicomFile(makeDicom({ rows: 2, columns: 2, frames: 3, pixels: Array.from({ length: 12 }, (_, i) => i) }), "m.dcm");
    expect(frames).toHaveLength(3);
    expect(frames.map((f) => f.frameIndex)).toEqual([0, 1, 2]);
    expect(Array.from(frames[2].pixels)).toEqual([8, 9, 10, 11]);
    expect(new Set(frames.map((f) => f.key)).size).toBe(3);
  });

  it("reads implicit VR little endian files", () => {
    const [frame] = parseDicomFile(makeDicom({ transferSyntax: "1.2.840.10008.1.2", rows: 2, columns: 2, pixels: [1, 2, 3, 4] }), "i.dcm");
    expect(Array.from(frame.pixels)).toEqual([1, 2, 3, 4]);
  });

  it("reads 8-bit pixel data", () => {
    const [frame] = parseDicomFile(makeDicom({ bitsAllocated: 8, rows: 2, columns: 2, pixels: [0, 64, 128, 255] }), "8.dcm");
    expect(Array.from(frame.pixels)).toEqual([0, 64, 128, 255]);
  });

  it("rejects files that aren't DICOM, have no pixel data, are compressed, or are colour", () => {
    expect(codeOf(() => parseDicomFile(new TextEncoder().encode("hello world").buffer, "notes.txt"))).toBe("not-dicom");
    expect(codeOf(() => parseDicomFile(new ArrayBuffer(400), "zeros.bin"))).toBe("not-dicom");
    expect(codeOf(() => parseDicomFile(makeDicom({ omitPixelData: true }), "DICOMDIR"))).toBe("no-pixel-data");
    expect(codeOf(() => parseDicomFile(makeDicom({ transferSyntax: "1.2.840.10008.1.2.4.90" }), "j2k.dcm"))).toBe(
      "unsupported-transfer-syntax"
    );
    expect(codeOf(() => parseDicomFile(makeDicom({ photometric: "RGB", samplesPerPixel: 3 }), "rgb.dcm"))).toBe(
      "unsupported-pixel-format"
    );
  });
});

describe("study assembly", () => {
  const slice = (opts: Parameters<typeof makeDicom>[0], name: string) => parseDicomFile(makeDicom(opts), name)[0];

  it("orders slices along the slice normal when geometry is present", () => {
    const frames = [5, -5, 0].map((z, i) =>
      slice({ imagePosition: [0, 0, z], imageOrientation: AXIAL, instanceNumber: 10 - i }, `f${i}.dcm`)
    );
    expect(sortFrames(frames).map((f) => f.imagePosition![2])).toEqual([-5, 0, 5]);
  });

  it("falls back to instance number, then file name", () => {
    const byInstance = [3, 1, 2].map((n) => slice({ instanceNumber: n }, `x${n}.dcm`));
    expect(sortFrames(byInstance).map((f) => f.instanceNumber)).toEqual([1, 2, 3]);
    const byName = ["img10.dcm", "img2.dcm", "img1.dcm"].map((n) => slice({}, n));
    expect(sortFrames(byName).map((f) => f.fileName)).toEqual(["img1.dcm", "img2.dcm", "img10.dcm"]);
  });

  it("groups series, orders them by series number, and drops duplicate files", () => {
    const t1 = slice({ seriesInstanceUID: "1.2.3.2", seriesNumber: 2, seriesDescription: "T1", instanceNumber: 1, sopInstanceUID: "9.1" }, "a");
    const t2a = slice({ seriesInstanceUID: "1.2.3.1", seriesNumber: 1, seriesDescription: "T2", instanceNumber: 2, sopInstanceUID: "9.2" }, "b");
    const t2b = slice({ seriesInstanceUID: "1.2.3.1", seriesNumber: 1, seriesDescription: "T2", instanceNumber: 1, sopInstanceUID: "9.3" }, "c");
    const study = buildStudy([t1, t2a, t2b, t2a])!;
    expect(study.series.map((s) => s.description)).toEqual(["T2", "T1"]);
    expect(study.series[0].frames.map((f) => f.instanceNumber)).toEqual([1, 2]);
    expect(study.patientName).toBe("TEST PATIENT");
  });

  it("returns null for no frames", () => {
    expect(buildStudy([])).toBeNull();
  });
});

describe("windowing", () => {
  it("implements the DICOM linear VOI function", () => {
    expect(voiLinear(0, 40, 80)).toBe(0);
    expect(voiLinear(80, 40, 80)).toBe(255);
    expect(voiLinear(39.5, 40, 80)).toBeCloseTo(127.5);
  });

  it("uses the header window when present, otherwise the full range", () => {
    const withWindow = parseDicomFile(makeDicom({ windowCenter: 100, windowWidth: 50 }), "w")[0];
    expect(defaultWindow(withWindow)).toEqual({ center: 100, width: 50 });
    const without = parseDicomFile(makeDicom({ rows: 1, columns: 2, pixels: [0, 200] }), "n")[0];
    expect(defaultWindow(without)).toEqual({ center: 100, width: 200 });
  });

  it("renders grayscale RGBA and honours MONOCHROME1 and user inversion", () => {
    const frame = parseDicomFile(makeDicom({ rows: 1, columns: 2, pixels: [0, 1000] }), "r")[0];
    const out = new Uint8ClampedArray(8);
    renderFrameToRgba(frame, { center: 500, width: 1000 }, false, out);
    expect([out[0], out[4], out[7]]).toEqual([0, 255, 255]);
    renderFrameToRgba(frame, { center: 500, width: 1000 }, true, out);
    expect([out[0], out[4]]).toEqual([255, 0]);
    const mono1 = parseDicomFile(makeDicom({ rows: 1, columns: 2, pixels: [0, 1000], photometric: "MONOCHROME1" }), "m1")[0];
    renderFrameToRgba(mono1, { center: 500, width: 1000 }, false, out);
    expect([out[0], out[4]]).toEqual([255, 0]);
  });
});

describe("slice navigation", () => {
  it("clamps to the study bounds", () => {
    expect(clampSlice(-3, 10)).toBe(0);
    expect(clampSlice(12, 10)).toBe(9);
    expect(clampSlice(4.6, 10)).toBe(5);
    expect(clampSlice(3, 0)).toBe(0);
  });

  it("moves one slice per mouse-wheel notch and accumulates trackpad deltas", () => {
    const step = createWheelStepper();
    expect(step(100)).toBe(1);
    expect(step(-120)).toBe(-1);
    expect(step(3, 1)).toBe(1); // line-mode wheel
    expect(step(10)).toBe(0);
    expect(step(10)).toBe(0);
    expect(step(15)).toBe(1);
    expect(step(-20)).toBe(0); // direction change discards the forward remainder
    expect(step(-20)).toBe(-1);
  });
});

describe("loadStudy", () => {
  it("parses valid files, reports skipped ones with reasons, and reports progress", async () => {
    const sources: DicomSource[] = [
      { name: "1.dcm", read: async () => makeDicom({ instanceNumber: 1, sopInstanceUID: "5.1" }) },
      { name: "readme.txt", read: async () => new TextEncoder().encode("not an image").buffer },
      { name: "2.dcm", read: async () => makeDicom({ instanceNumber: 2, sopInstanceUID: "5.2" }) },
      { name: "broken", read: async () => Promise.reject(new Error("network down")) },
    ];
    const progress = vi.fn();
    const { study, skipped } = await loadStudy(sources, progress);
    expect(study!.series[0].frames).toHaveLength(2);
    expect(skipped.map((s) => s.name)).toEqual(["broken", "readme.txt"]);
    expect(skipped[0].reason).toMatch(/network down/);
    expect(skipped[1].reason).toMatch(/Not a DICOM file/);
    expect(progress).toHaveBeenLastCalledWith(4, 4);
  });
});
