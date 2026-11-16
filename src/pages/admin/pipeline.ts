import { adminApi } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export type Step = { file: string; stage: string; pct: number; error?: string; done?: boolean };
type Report = (s: Step) => void;

/** Full ingestion: upload → (unzip) → extract & version → embed → FAQ generation. Leaves everything in "review". */
export async function ingestFile(file: File, kind: string, report: Report, targetPolicyId?: string | null) {
  const name = file.name;
  report({ file: name, stage: "Uploading", pct: 5 });
  const up = await adminApi<{ document_id: string; path: string; token: string }>("create_upload", { file_name: name, size: file.size, mime: file.type, kind, target_policy_id: targetPolicyId ?? null });
  const { error } = await supabase.storage.from("documents").uploadToSignedUrl(up.path, up.token, file, { contentType: file.type || undefined });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  if (name.toLowerCase().endsWith(".zip")) {
    report({ file: name, stage: "Extracting ZIP", pct: 10 });
    const z = await adminApi<{ created: { id: string; file_name: string; kind: string }[] }>("expand_zip", { document_id: up.document_id });
    report({ file: name, stage: `Extracted ${z.created.length} files`, pct: 100, done: true });
    for (const c of z.created) {
      try { await processOne(c.id, c.file_name, report, null); }
      catch (e) { report({ file: c.file_name, stage: "Failed", pct: 100, error: (e as Error).message, done: true }); }
    }
    return;
  }
  await processOne(up.document_id, name, report, targetPolicyId ?? null);
}

export async function processOne(documentId: string, name: string, report: Report, targetPolicyId: string | null) {
  report({ file: name, stage: "Reading document", pct: 20 });
  const r = await adminApi<any>("process_document", { document_id: documentId, target_policy_id: targetPolicyId });
  if (r.kind !== "policy") { report({ file: name, stage: `Parsed ${r.created} rule set(s), review in Calculator Management`, pct: 100, done: true }); return; }
  await indexVersion(r.version_id, (pct) => report({ file: name, stage: `Indexing ${r.chunks} sections`, pct: 40 + pct * 0.35 }));
  report({ file: name, stage: "Generating FAQs", pct: 80 });
  const f = await adminApi<{ created: number; version_id?: string }>("generate_faqs", { version_id: r.version_id });
  await embedFaqsFor(r.version_id, (pct) => report({ file: name, stage: "Preparing questions for search", pct: 80 + pct * 0.18 }));
  report({ file: name, stage: `Ready for review (${f.created} FAQs${r.is_update ? ", new version" : ""})`, pct: 100, done: true, error: r.warning });
}

export async function indexVersion(versionId: string, onPct?: (p: number) => void) {
  for (let i = 0; i < 600; i++) {
    const e = await adminApi<{ remaining: number; total: number }>("embed_version", { version_id: versionId });
    onPct?.(e.total ? ((e.total - e.remaining) / e.total) * 100 : 100);
    if (!e.remaining) return;
  }
}

export async function embedFaqsFor(versionId: string, onPct?: (p: number) => void) {
  let first = -1;
  for (let i = 0; i < 80; i++) {
    const e = await adminApi<{ remaining: number }>("embed_faqs", { version_id: versionId });
    if (first < 0) first = e.remaining + 3;
    onPct?.(first ? Math.min(100, ((first - e.remaining) / first) * 100) : 100);
    if (!e.remaining) return;
  }
}
