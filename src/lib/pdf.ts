import { jsPDF } from "jspdf";
/** Simple, dependable text PDF for calculator results. "₹" is replaced with "Rs." because base PDF fonts lack the glyph. */
export function downloadReport(title: string, sections: { heading: string; rows: [string, string][] }[], notes: string[], fileName: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const clean = (s: string) => s.replace(/₹/g, "Rs. ").replace(/[^\x20-\x7E]/g, (c) => (c === "−" ? "-" : c === "×" ? "x" : c === "÷" ? "/" : " "));
  let y = 56;
  doc.setFillColor(238, 90, 36); doc.rect(0, 0, 595, 6, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(clean(title), 48, y); y += 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90); doc.text(`Petpooja PeopleHub · Generated ${new Date().toLocaleString("en-IN")}`, 48, y); y += 26; doc.setTextColor(20);
  const ensure = (h: number) => { if (y + h > 800) { doc.addPage(); y = 56; } };
  for (const s of sections) {
    ensure(40); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(clean(s.heading), 48, y); y += 16;
    doc.setFontSize(10);
    for (const [k, v] of s.rows) { ensure(16); doc.setFont("helvetica", "normal"); doc.text(clean(k), 48, y); doc.setFont("helvetica", "bold"); doc.text(clean(v), 547, y, { align: "right" }); y += 15; }
    y += 10;
  }
  if (notes.length) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80);
    for (const n of notes) { const lines = doc.splitTextToSize(clean(n), 499); ensure(lines.length * 12 + 4); doc.text(lines, 48, y); y += lines.length * 12 + 4; }
  }
  doc.save(fileName);
}
