import type { Specimen } from "@/types/phlebotomy.types";

/** Deterministic bar widths derived from the barcode's own characters — a visual barcode-style label, not a decoded-scannable Code128/39 rendering (that needs a real barcode-generation library this project doesn't depend on). The human-readable barcode text underneath is what a phlebotomist actually reads back to re-enter the value if a scan fails, exactly like a real specimen label. */
function barcodeBars(value: string): number[] {
  return value.split("").map((ch) => (ch.charCodeAt(0) % 3) + 1);
}

function patientName(specimen: Specimen): string {
  if (typeof specimen.patientId === "string") return specimen.patientId;
  return `${specimen.patientId.firstName} ${specimen.patientId.lastName}`;
}
function patientUhid(specimen: Specimen): string {
  return typeof specimen.patientId === "string" ? "" : specimen.patientId.uhid;
}
function orderNumber(specimen: Specimen): string {
  return typeof specimen.labOrderId === "string" ? specimen.labOrderId : specimen.labOrderId.orderNumber;
}

/** Opens a small print window with one specimen label and triggers the browser's real print dialog against it — this is an actual print action, not a simulated one, just without a physical label printer attached in this environment. */
export function printSpecimenLabel(specimen: Specimen): void {
  const bars = barcodeBars(specimen.barcodeValue);
  const barsHtml = bars
    .map((width, i) => `<div style="width:${width * 2}px;height:44px;background:${i % 2 === 0 ? "#0f172a" : "#fff"};"></div>`)
    .join("");

  const html = `<!doctype html>
<html>
<head>
<title>Specimen Label — ${specimen.barcodeValue}</title>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; margin: 0; padding: 16px; }
  .label { width: 300px; border: 1px solid #94a3b8; border-radius: 8px; padding: 10px 12px; }
  .bars { display: flex; gap: 0; margin: 8px 0 4px; }
  .barcode-text { font-family: "SFMono-Regular", Consolas, monospace; font-size: 13px; letter-spacing: 2px; text-align: center; }
  .row { display: flex; justify-content: space-between; font-size: 11px; color: #475569; margin-top: 2px; }
  .patient { font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 6px; }
</style>
</head>
<body onload="window.print()">
  <div class="label">
    <div class="patient">${patientName(specimen)}</div>
    <div class="row"><span>UHID</span><span>${patientUhid(specimen)}</span></div>
    <div class="row"><span>Order</span><span>${orderNumber(specimen)}</span></div>
    <div class="row"><span>Specimen</span><span>${specimen.specimenType} (${specimen.containerType})</span></div>
    <div class="bars">${barsHtml}</div>
    <div class="barcode-text">${specimen.barcodeValue}</div>
  </div>
</body>
</html>`;

  const printWindow = window.open("", "_blank", "width=380,height=320");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
}
