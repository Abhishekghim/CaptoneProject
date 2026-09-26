// jsdom's Blob polyfill only implements slice/size/type (no .text()/
// .arrayBuffer()), so this file overrides the environment to Node's real
// Blob, which does — the function under test has no DOM dependency anyway.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateReceiptPdf } from "@/frontend/lib/receiptPdf";

describe("generateReceiptPdf", () => {
  it("returns a Blob with the application/pdf MIME type", () => {
    const blob = generateReceiptPdf(["Capital Radiology", "Receipt #123", "Total: $250.00"]);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
  });

  it("produces bytes starting with the PDF header and ending with %%EOF", async () => {
    const blob = generateReceiptPdf(["Capital Radiology", "Receipt #123", "Total: $250.00"]);
    const text = await blob.text();

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.endsWith("%%EOF")).toBe(true);
  });

  it("escapes parentheses and backslashes in line text so the content stream stays well-formed", async () => {
    const blob = generateReceiptPdf(["Line with (parens) and a \\backslash\\"]);
    const text = await blob.text();

    expect(text).toContain("Line with \\(parens\\) and a \\\\backslash\\\\");
  });

  it("includes a well-formed xref table sized for the fixed 5-object document", async () => {
    const blob = generateReceiptPdf(["Just one line"]);
    const text = await blob.text();

    expect(text).toContain("xref\n0 6\n");
    expect(text).toContain("trailer\n<< /Size 6 /Root 1 0 R >>");
  });

  it("handles an empty lines array without throwing", async () => {
    const blob = generateReceiptPdf([]);
    const text = await blob.text();

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.endsWith("%%EOF")).toBe(true);
  });
});
