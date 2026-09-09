/**
 * Hand-rolled minimal single-page PDF writer — no external dependency.
 * Produces a genuinely valid PDF file (correct xref table, real byte
 * offsets) containing plain text lines, used to issue real digital
 * receipts (FR36) instead of a fake "receipts/bill-1.pdf" string that
 * points at nothing.
 */
function pdfEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function generateReceiptPdf(lines: string[]): Blob {
  const fontSize = 12;
  const startY = 740;
  const lineHeight = 18;

  let contentStream = `BT /F1 ${fontSize} Tf 50 ${startY} Td\n`;
  lines.forEach((line, i) => {
    contentStream += i === 0
      ? `(${pdfEscape(line)}) Tj\n`
      : `0 -${lineHeight} Td (${pdfEscape(line)}) Tj\n`;
  });
  contentStream += "ET";

  const objects: string[] = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

export function downloadReceiptPdf(fileName: string, lines: string[]) {
  const blob = generateReceiptPdf(lines);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
