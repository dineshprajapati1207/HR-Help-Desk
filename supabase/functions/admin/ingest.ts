import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { embed, toVector, EMB_MODEL } from "../_shared/llm.ts";
import { buildFaqs, detectMeta, diffSummary } from "../_shared/nlp.ts";
import { extractText, unzip, chunkText, extOf } from "../_shared/extract.ts";
import { POLICY_CATEGORIES, slugify } from "../_shared/common.ts";

async function setDoc(db: SupabaseClient, id: string, patch: Record<string, unknown>) {
  await db.from("documents").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

async function download(db: SupabaseClient, path: string) {
  const { data, error } = await db.storage.from("documents").download(path);
  if (error || !data) throw new Error(`Could not read the uploaded file from storage: ${error?.message ?? "missing"}`);
  return new Uint8Array(await data.arrayBuffer());
}

const mimeFor = (n: string) => ({
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword",
  txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel",
} as Record<string, string>)[extOf(n)] ?? "application/octet-stream";

export async function expandZip(db: SupabaseClient, documentId: string) {
  const { data: doc } = await db.from("documents").select("*").eq("id", documentId).single();
  if (!doc) throw new Error("Document not found");
  await setDoc(db, documentId, { status: "extracting", progress: 10 });
  try {
    const files = await unzip(await download(db, doc.storage_path));
    if (!files.length) throw new Error("The ZIP has no supported files (PDF, DOC, DOCX, TXT, XLSX, CSV, JSON).");
    const created: { id: string; file_name: string; kind: string }[] = [];
    for (const f of files) {
      const base = f.name.split("/").pop()!;
      const id = crypto.randomUUID();
      const path = `uploads/${id}/${base.replace(/[^\w.\- ]/g, "_")}`;
      const { error } = await db.storage.from("documents").upload(path, f.bytes, { contentType: mimeFor(base), upsert: true });
      if (error) throw error;
      // Auto-detect income tax / PF rule files inside the ZIP
      const kind = /income\s*tax|tax.*rule/i.test(base) ? "tax_rule" : /\bpf\b|provident/i.test(base) && /rule/i.test(base) ? "pf_rule" : doc.kind;
      await db.from("documents").insert({ id, kind, file_name: base, storage_path: path, mime_type: mimeFor(base), size_bytes: f.bytes.length, parent_document_id: documentId, status: "uploaded" });
      created.push({ id, file_name: base, kind });
    }
    await setDoc(db, documentId, { status: "published", progress: 100, error: null });
    return { created };
  } catch (e) {
    await setDoc(db, documentId, { status: "error", error: (e as Error).message });
    throw e;
  }
}

export async function processDocument(db: SupabaseClient, documentId: string, targetPolicyId?: string | null) {
  const { data: doc } = await db.from("documents").select("*").eq("id", documentId).single();
  if (!doc) throw new Error("Document not found");
  await setDoc(db, documentId, { status: "extracting", progress: 15, error: null });
  try {
    const { text, warning } = await extractText(doc.file_name, await download(db, doc.storage_path));
    if (text.replace(/\s/g, "").length < 30) throw new Error("No readable text found in this file. If it is a scanned PDF, upload a text-based copy.");

    if (doc.kind === "tax_rule") return await parseTaxRules(db, doc, text);
    if (doc.kind === "pf_rule") return await parsePfRules(db, doc, text);

    // 1) metadata (read from the document itself)
    const meta = detectMeta(doc.file_name, text, POLICY_CATEGORIES);
    const title = (meta.title || doc.file_name.replace(/\.[^.]+$/, "")).trim();
    const category = meta.category;

    // 2) policy (existing → new version)
    let policyId = targetPolicyId ?? doc.policy_id ?? null;
    if (!policyId) {
      const { data: ex } = await db.from("policies").select("id").eq("slug", slugify(title)).maybeSingle();
      policyId = ex?.id ?? null;
    }
    if (!policyId) {
      const { data: np, error } = await db.from("policies").insert({ name: title, slug: slugify(title) || crypto.randomUUID(), category, description: meta.description, status: "draft" }).select("id").single();
      if (error) throw error;
      policyId = np.id;
    }
    try { // a retry of the same file replaces its unfinished (still pending) earlier attempt
      const { data: stale } = await db.from("document_versions").select("id").eq("document_id", documentId).eq("approval_status", "pending");
      if (stale?.length) {
        const ids = stale.map((x) => x.id);
        const { data: ch } = await db.from("document_chunks").select("id").in("version_id", ids);
        if (ch?.length) await db.from("document_embeddings").delete().in("chunk_id", ch.map((c) => c.id));
        await db.from("faqs").delete().in("version_id", ids);
        await db.from("document_chunks").delete().in("version_id", ids);
        await db.from("document_versions").delete().in("id", ids);
      }
    } catch (e) { console.error("cleanup skipped", e); }
    const { data: prev } = await db.from("document_versions").select("id,version_number,extracted_text").eq("policy_id", policyId).order("version_number", { ascending: false }).limit(1);
    const { data: pol } = await db.from("policies").select("current_version_id").eq("id", policyId).single();
    const versionNumber = (prev?.[0]?.version_number ?? 0) + 1;

    let changeSummary: string | null = null;
    const baseline = pol?.current_version_id
      ? (await db.from("document_versions").select("extracted_text").eq("id", pol.current_version_id).single()).data?.extracted_text
      : prev?.[0]?.extracted_text;
    if (baseline) changeSummary = diffSummary(baseline, text);

    const { data: ver, error: vErr } = await db.from("document_versions").insert({
      policy_id: policyId, document_id: documentId, version_number: versionNumber, version_label: meta.version ?? `v${versionNumber}`,
      title, category, effective_date: meta.effective_date && /^\d{4}-\d{2}-\d{2}$/.test(meta.effective_date) ? meta.effective_date : null,
      extracted_text: text, change_summary: changeSummary, approval_status: "pending",
    }).select("id").single();
    if (vErr) throw vErr;

    const chunks = await rechunk(db, ver.id, policyId, text);
    await db.from("documents").update({ policy_id: policyId }).eq("id", documentId);
    await setDoc(db, documentId, { status: "embedding", progress: 45, error: warning ?? null });
    return { kind: "policy", policy_id: policyId, version_id: ver.id, chunks, warning, is_update: !!baseline };
  } catch (e) {
    await setDoc(db, documentId, { status: "error", error: (e as Error).message });
    throw e;
  }
}

export async function rechunk(db: SupabaseClient, versionId: string, policyId: string, text: string) {
  await db.from("document_chunks").delete().eq("version_id", versionId);
  const chunks = chunkText(text);
  for (let i = 0; i < chunks.length; i += 200) {
    const rows = chunks.slice(i, i + 200).map((c, j) => ({ version_id: versionId, policy_id: policyId, chunk_index: i + j, section: c.section, content: c.content }));
    const { error } = await db.from("document_chunks").insert(rows);
    if (error) throw error;
  }
  return chunks.length;
}

export async function embedVersion(db: SupabaseClient, versionId: string) {
  const { data: chunks } = await db.from("document_chunks").select("id,section,content").eq("version_id", versionId).order("chunk_index");
  const ids = (chunks ?? []).map((c) => c.id);
  if (!ids.length) return { remaining: 0, total: 0 };
  const { data: done } = await db.from("document_embeddings").select("chunk_id").in("chunk_id", ids);
  const doneSet = new Set((done ?? []).map((d) => d.chunk_id));
  const todo = (chunks ?? []).filter((c) => !doneSet.has(c.id)).slice(0, 2);
  if (todo.length) {
    const { data: v } = await db.from("document_versions").select("title").eq("id", versionId).single();
    const vecs = await embed(todo.map((c) => `${v?.title ?? ""}${c.section ? " — " + c.section : ""}\n${c.content}`));
    const { error } = await db.from("document_embeddings").upsert(todo.map((c, i) => ({ chunk_id: c.id, embedding: toVector(vecs[i]), model: EMB_MODEL })));
    if (error) throw error;
  }
  const remaining = ids.length - doneSet.size - todo.length;
  const { data: ver } = await db.from("document_versions").select("document_id").eq("id", versionId).single();
  if (ver?.document_id) await setDoc(db, ver.document_id, { progress: remaining ? 60 : 70, status: remaining ? "embedding" : "generating_faqs" });
  return { remaining, total: ids.length };
}

export async function generateFaqs(db: SupabaseClient, versionId: string) {
  const { data: v } = await db.from("document_versions").select("id,policy_id,title,extracted_text,document_id").eq("id", versionId).single();
  if (!v) throw new Error("Version not found");
  const len = v.extracted_text?.length ?? 0;
  const target = len < 4000 ? 18 : len < 12000 ? 28 : 38;
  const faqs = buildFaqs(v.title, v.extracted_text ?? "", target);
  if (!faqs.length) return { created: 0 };
  const rows = faqs.map((f) => ({
    policy_id: v.policy_id, version_id: v.id, question: f.question, short_answer: f.short_answer ?? null,
    detailed_answer: f.detailed_answer ?? null, section: f.section ?? null,
    related_questions: Array.isArray(f.related_questions) ? f.related_questions.slice(0, 3) : [],
    status: "pending", source: "ai",
  }));
  const { error } = await db.from("faqs").insert(rows);
  if (error) throw error;
  if (v.document_id) await setDoc(db, v.document_id, { status: "review", progress: 90 });
  return { created: rows.length, version_id: v.id };
}

/** Embeds a few FAQs per call (the built-in model has tight per-request limits). The caller repeats until remaining is 0. */
export async function embedFaqs(db: SupabaseClient, versionId: string) {
  const { data: todo } = await db.from("faqs").select("id,question,short_answer").eq("version_id", versionId).is("embedding", null).limit(3);
  if (todo?.length) {
    const vecs = await embed(todo.map((f) => `${f.question}\n${f.short_answer ?? ""}`));
    for (let i = 0; i < todo.length; i++) await db.from("faqs").update({ embedding: toVector(vecs[i]) }).eq("id", todo[i].id);
  }
  const { count } = await db.from("faqs").select("id", { count: "exact", head: true }).eq("version_id", versionId).is("embedding", null);
  return { remaining: count ?? 0 };
}

const NO_AUTO = "Rule files are not read automatically. Enter these values in Admin > Calculator Management.";

async function parseTaxRules(db: SupabaseClient, doc: any, _text: string) {
  await setDoc(db, doc.id, { status: "review", progress: 100, error: NO_AUTO });
  return { kind: "tax_rule", created: 0 };
}

async function parsePfRules(db: SupabaseClient, doc: any, _text: string) {
  await setDoc(db, doc.id, { status: "review", progress: 100, error: NO_AUTO });
  return { kind: "pf_rule", created: 0 };
}
