import { Buffer } from "node:buffer";

export const SUPPORTED_EXT = ["pdf", "doc", "docx", "txt", "xlsx", "xls", "csv", "json", "md"];

export function extOf(name: string) {
  return (name.split(".").pop() ?? "").toLowerCase();
}

export async function extractText(fileName: string, bytes: Uint8Array): Promise<{ text: string; warning?: string }> {
  const ext = extOf(fileName);
  if (ext === "txt" || ext === "md") return { text: new TextDecoder().decode(bytes) };
  if (ext === "json") {
    const raw = new TextDecoder().decode(bytes);
    try { return { text: jsonToText(JSON.parse(raw)) }; } catch { return { text: raw, warning: "JSON could not be parsed; indexed as plain text." }; }
  }
  if (ext === "pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("npm:unpdf@0.12.1");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await pdfText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).map((t: string, i: number) => `[Page ${i + 1}]\n${t}`);
    const joined = pages.join("\n\n");
    return { text: joined, warning: joined.replace(/\[Page \d+\]/g, "").trim().length < 50 ? "Very little text found. The PDF may be scanned; upload a text-based PDF or DOCX." : undefined };
  }
  if (ext === "docx") {
    const mammoth = await import("npm:mammoth@1.8.0");
    const r = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { text: r.value };
  }
  if (ext === "doc") {
    try {
      const WordExtractor = (await import("npm:word-extractor@1.0.4")).default;
      const doc = await new WordExtractor().extract(Buffer.from(bytes));
      return { text: doc.getBody() };
    } catch {
      const printable = new TextDecoder("latin1").decode(bytes).replace(/[^\x20-\x7E\n\r\t]+/g, " ").replace(/ {2,}/g, " ");
      return { text: printable, warning: "Legacy .doc parsed with a fallback reader. Review the text carefully or upload DOCX/PDF." };
    }
  }
  if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    const XLSX = await import("npm:xlsx@0.18.5");
    const wb = ext === "csv" ? XLSX.read(new TextDecoder().decode(bytes), { type: "string" }) : XLSX.read(bytes, { type: "array" });
    const parts = wb.SheetNames.map((n: string) => `## Sheet: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`);
    return { text: parts.join("\n\n") };
  }
  throw new Error(`Unsupported file type: .${ext}`);
}

function jsonToText(v: unknown, prefix = ""): string {
  if (v === null || typeof v !== "object") return `${prefix}${String(v)}`;
  if (Array.isArray(v)) return v.map((x, i) => jsonToText(x, `${prefix}[${i}] `)).join("\n");
  return Object.entries(v as Record<string, unknown>).map(([k, x]) =>
    typeof x === "object" && x !== null ? `${prefix}${k}:\n${jsonToText(x, prefix + "  ")}` : `${prefix}${k}: ${x}`).join("\n");
}

export async function unzip(bytes: Uint8Array): Promise<{ name: string; bytes: Uint8Array }[]> {
  const JSZip = (await import("npm:jszip@3.10.1")).default;
  const zip = await JSZip.loadAsync(bytes);
  const files: { name: string; bytes: Uint8Array }[] = [];
  const entries = Object.values(zip.files) as any[];
  for (const entry of entries) {
    if (entry.dir) continue;
    const base = entry.name.split("/").pop() ?? entry.name;
    if (base.startsWith(".") || entry.name.includes("__MACOSX") || base.startsWith("~$")) continue;
    const ext = extOf(base);
    const data: Uint8Array = await entry.async("uint8array");
    if (ext === "zip") files.push(...(await unzip(data)).map((f) => ({ ...f, name: `${base}/${f.name}` })));
    else if (SUPPORTED_EXT.includes(ext)) files.push({ name: entry.name, bytes: data });
  }
  return files;
}

/** Heading-aware chunking (~1200 chars, 150 overlap). Each chunk carries the nearest section heading. */
export function chunkText(text: string): { section: string | null; content: string }[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const isHeading = (l: string) => {
    const t = l.trim();
    if (!t || t.length > 90) return false;
    if (/^\[Page \d+\]$/.test(t)) return false;
    return /^(\d+(\.\d+)*[.)]?\s+\S)|^(section|clause|article|chapter|annexure)\b/i.test(t) || (t === t.toUpperCase() && /[A-Z]/.test(t) && t.split(" ").length <= 10) || /:$/.test(t);
  };
  const blocks: { section: string | null; text: string }[] = [];
  let section: string | null = null;
  let buf: string[] = [];
  const flush = () => { const t = buf.join("\n").trim(); if (t) blocks.push({ section, text: t }); buf = []; };
  for (const l of lines) {
    if (isHeading(l)) { flush(); section = l.trim().replace(/:$/, ""); buf.push(l); } else buf.push(l);
  }
  flush();
  const chunks: { section: string | null; content: string }[] = [];
  const MAX = 1200, OVER = 150;
  for (const b of blocks) {
    if (b.text.length <= MAX) { chunks.push({ section: b.section, content: b.text }); continue; }
    let i = 0;
    while (i < b.text.length) {
      let end = Math.min(i + MAX, b.text.length);
      const cut = b.text.lastIndexOf(". ", end);
      if (cut > i + MAX * 0.6 && end < b.text.length) end = cut + 1;
      chunks.push({ section: b.section, content: b.text.slice(i, end).trim() });
      if (end >= b.text.length) break;
      i = end - OVER;
    }
  }
  // merge tiny chunks into neighbours
  const merged: typeof chunks = [];
  for (const c of chunks) {
    const last = merged[merged.length - 1];
    if (last && (c.content.length < 200 || last.content.length < 200) && last.content.length + c.content.length < MAX) {
      last.content += "\n" + c.content; last.section = last.section ?? c.section;
    } else merged.push({ ...c });
  }
  return merged.filter((c) => c.content.replace(/\s/g, "").length > 20);
}
