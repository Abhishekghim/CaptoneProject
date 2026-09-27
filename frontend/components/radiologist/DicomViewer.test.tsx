import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { makeDicom } from "@/test/dicomFixture";
import DicomViewer from "./DicomViewer";

const listStoredDicom = vi.fn();
vi.mock("@/frontend/lib/storage", () => ({ listStoredDicom: (...args: unknown[]) => listStoredDicom(...args) }));

function dicomFile(name: string, opts: Parameters<typeof makeDicom>[0]) {
  return new File([makeDicom(opts)], name, { type: "application/dicom" });
}

function series(n: number) {
  // Deliberately out of order: the viewer must sort by instance number.
  return Array.from({ length: n }, (_, i) => n - i).map((instance) =>
    dicomFile(`IM${instance}.dcm`, { instanceNumber: instance, sopInstanceUID: `1.2.3.${instance}`, seriesDescription: "AX T2 FSE" })
  );
}

async function openFiles(files: File[]) {
  const input = screen.getByTestId("dicom-file-input");
  await act(async () => {
    fireEvent.change(input, { target: { files } });
  });
}

const position = () => screen.getByTestId("slice-position").textContent;
const viewport = () => screen.getByRole("application");

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  listStoredDicom.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DicomViewer", () => {
  it("shows an upload-ready empty state when no study is attached", () => {
    render(<DicomViewer scanId="s1" bodyPart="Brain" allowLocalFiles />);
    expect(screen.getByText("No DICOM study loaded")).toBeInTheDocument();
    expect(screen.getByText(/No images are attached to this scan yet/)).toBeInTheDocument();
    // Offered both in the toolbar and as the empty state's call to action.
    expect(screen.getAllByRole("button", { name: "Open DICOM files" })).toHaveLength(2);
    expect(position()).toBe("No slices");
    expect(screen.getByRole("slider", { name: "Slice" })).toBeDisabled();
    expect(listStoredDicom).not.toHaveBeenCalled();
  });

  it("offers no file picker in read-only viewers", () => {
    render(<DicomViewer scanId="s1" bodyPart="Brain" />);
    expect(screen.getByText("No images are available for this scan.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open DICOM/ })).not.toBeInTheDocument();
  });

  it("loads user-provided DICOM files as an ordered stack with metadata", async () => {
    render(<DicomViewer scanId="s1" bodyPart="Brain" allowLocalFiles />);
    await openFiles(series(3));

    await waitFor(() => expect(position()).toBe("Slice 1 of 3"));
    expect(screen.getByText("Opened from this computer — not attached to the scan")).toBeInTheDocument();
    expect(screen.getByText("TEST PATIENT", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "dd" })).toBeInTheDocument(); // instance number of slice 1
    expect(viewport()).toHaveAccessibleName("AX T2 FSE — slice 1 of 3");
  });

  it("navigates slices with keys, buttons, slider and wheel without leaving the bounds", async () => {
    render(<DicomViewer scanId="s1" bodyPart="Brain" allowLocalFiles />);
    await openFiles(series(5));
    await waitFor(() => expect(position()).toBe("Slice 1 of 5"));

    fireEvent.keyDown(viewport(), { key: "ArrowUp" });
    expect(position()).toBe("Slice 1 of 5");
    expect(screen.getByRole("button", { name: "Previous slice" })).toBeDisabled();

    fireEvent.keyDown(viewport(), { key: "ArrowDown" });
    expect(position()).toBe("Slice 2 of 5");
    fireEvent.keyDown(viewport(), { key: "End" });
    expect(position()).toBe("Slice 5 of 5");
    fireEvent.keyDown(viewport(), { key: "PageDown" });
    expect(position()).toBe("Slice 5 of 5");
    expect(screen.getByRole("button", { name: "Next slice" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "First slice" }));
    expect(position()).toBe("Slice 1 of 5");
    fireEvent.click(screen.getByRole("button", { name: "Next slice" }));
    expect(position()).toBe("Slice 2 of 5");

    fireEvent.change(screen.getByRole("slider", { name: "Slice" }), { target: { value: "4" } });
    expect(position()).toBe("Slice 4 of 5");

    fireEvent.wheel(viewport(), { deltaY: 100 });
    expect(position()).toBe("Slice 5 of 5");
    fireEvent.wheel(viewport(), { deltaY: 100 });
    expect(position()).toBe("Slice 5 of 5");
    fireEvent.wheel(viewport(), { deltaY: -100 });
    expect(position()).toBe("Slice 4 of 5");
    fireEvent.keyDown(viewport(), { key: "Home" });
    expect(position()).toBe("Slice 1 of 5");
  });

  it("reports files it can't display and keeps the valid ones", async () => {
    render(<DicomViewer scanId="s1" bodyPart="Brain" allowLocalFiles />);
    await openFiles([...series(2), new File(["hello"], "notes.txt")]);
    await waitFor(() => expect(position()).toBe("Slice 1 of 2"));
    expect(screen.getByText("1 file skipped")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
  });

  it("shows an error when nothing in the selection is displayable", async () => {
    render(<DicomViewer scanId="s1" bodyPart="Brain" allowLocalFiles />);
    await openFiles([new File(["hello"], "photo.jpg"), dicomFile("x.dcm", { transferSyntax: "1.2.840.10008.1.2.4.50" })]);
    expect(await screen.findByRole("alert")).toHaveTextContent("None of the selected files could be displayed.");
    expect(screen.getByText(/Compressed pixel data \(JPEG Baseline\)/)).toBeInTheDocument();
    expect(position()).toBe("No slices");
  });

  it("loads the scan's stored series", async () => {
    const buffers = [2, 3, 1].map((n) => makeDicom({ instanceNumber: n, sopInstanceUID: `7.7.${n}` }));
    listStoredDicom.mockResolvedValue(buffers.map((_, i) => ({ name: `IM${i}.dcm`, url: `https://storage.test/${i}` })));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => new Response(buffers[Number(String(url).split("/").pop())]));
    render(<DicomViewer scanId="s1" bodyPart="Brain" dicomImageUrl="dicom/tech/123-series/" />);

    await waitFor(() => expect(position()).toBe("Slice 1 of 3"));
    expect(listStoredDicom).toHaveBeenCalledWith("dicom/tech/123-series/");
    expect(screen.getByText("Images stored with this scan")).toBeInTheDocument();
  });

  it("explains when the stored study can't be loaded", async () => {
    listStoredDicom.mockRejectedValue(new Error("You don't have access to this scan's images, or they no longer exist."));
    render(<DicomViewer scanId="s1" bodyPart="Brain" dicomImageUrl="dicom/tech/gone.dcm" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this scan's images: You don't have access");
  });

  it("shows tool state and resets window/level", async () => {
    render(<DicomViewer scanId="s1" bodyPart="Brain" allowLocalFiles />);
    await openFiles([dicomFile("a.dcm", { windowCenter: 40, windowWidth: 400, instanceNumber: 1 })]);
    await waitFor(() => expect(position()).toBe("Slice 1 of 1"));

    const wl = screen.getByRole("button", { name: "Window / level" });
    const pan = screen.getByRole("button", { name: "Pan" });
    expect(wl).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(viewport(), { key: "p" });
    expect(pan).toHaveAttribute("aria-pressed", "true");
    expect(wl).toHaveAttribute("aria-pressed", "false");

    const width = screen.getByRole("spinbutton", { name: "Window width" });
    expect(width).toHaveValue(400);
    fireEvent.change(width, { target: { value: "150" } });
    expect(width).toHaveValue(150);
    fireEvent.click(screen.getByRole("button", { name: "Invert" }));
    expect(screen.getByRole("button", { name: "Invert" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(width).toHaveValue(400);
    expect(screen.getByRole("button", { name: "Invert" })).toHaveAttribute("aria-pressed", "false");
  });

  it("only allows annotating the scan's own stored images", async () => {
    render(<DicomViewer scanId="s1" bodyPart="Brain" allowLocalFiles canAnnotate onAddAnnotation={vi.fn()} />);
    await openFiles(series(2));
    await waitFor(() => expect(position()).toBe("Slice 1 of 2"));
    expect(screen.getByRole("button", { name: /Annotate \(only on this scan's stored images\)/ })).toBeDisabled();
  });
});
