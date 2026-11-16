import { corsHeaders, json, serviceClient, isTrustedAdmin, audit, CONTACT_CATEGORIES, slugify } from "../_shared/common.ts";
import { embed, toVector } from "../_shared/llm.ts";
import { expandZip, processDocument, embedVersion, generateFaqs, embedFaqs, rechunk } from "./ingest.ts";
import { SUPPORTED_EXT, extOf } from "../_shared/extract.ts";

const now = () => new Date().toISOString();
function range(p: any) {
  const to = p.to ? new Date(p.to) : new Date();
  const from = p.from ? new Date(p.from) : new Date(to.getTime() - 30 * 864e5);
  return { from: from.toISOString(), to: to.toISOString() };
}
const dayKey = (s: string) => s.slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = isTrustedAdmin(req);
  if (!guard.ok) {
    if (guard.code === "ADMIN_PASSCODE_INVALID") await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return json({ error: guard.reason, code: guard.code ?? "ADMIN_FORBIDDEN" }, guard.code ? 401 : 403);
  }
  const actor = guard.actor;
  const db = serviceClient();
  try {
    const { action, ...p } = await req.json();
    const A = (a: string, e: string, id: string | null, d?: unknown) => audit(db, a, e, id, d ?? null, actor);

    switch (action) {
      case "ping": return json({ ok: true, actor });

      // ================= DASHBOARD & ANALYTICS =================
      case "dashboard": {
        const { from, to } = range(p);
        const [pols, faqs, msgs, unans, recentDocs, recentPols] = await Promise.all([
          db.from("policies").select("status"),
          db.from("faqs").select("status"),
          db.from("chat_messages").select("role,confidence,topic,created_at").gte("created_at", from).lte("created_at", to).limit(20000),
          db.from("unanswered_queries").select("id", { count: "exact", head: true }).eq("status", "needs_review"),
          db.from("documents").select("id,file_name,status,created_at,kind").order("created_at", { ascending: false }).limit(6),
          db.from("policies").select("id,name,category,status,updated_at").order("updated_at", { ascending: false }).limit(6),
        ]);
        const { count: docCount } = await db.from("documents").select("id", { count: "exact", head: true }).not("file_name", "ilike", "%.zip");
        const ps = pols.data ?? [];
        const ms = msgs.data ?? [];
        const asst = ms.filter((m) => m.role === "assistant");
        const topics: Record<string, number> = {};
        for (const m of asst) if (m.topic) topics[m.topic] = (topics[m.topic] ?? 0) + 1;
        const perDay: Record<string, { day: string; questions: number; low: number }> = {};
        for (const m of asst) { const k = dayKey(m.created_at); perDay[k] ??= { day: k, questions: 0, low: 0 }; perDay[k].questions++; if (m.confidence === "low") perDay[k].low++; }
        return json({
          totals: {
            documents: docCount ?? 0,
            active_policies: ps.filter((x) => x.status === "active").length,
            inactive_policies: ps.filter((x) => x.status === "inactive").length,
            draft_policies: ps.filter((x) => x.status === "draft").length,
            faqs: (faqs.data ?? []).filter((f) => f.status === "approved").length,
            pending_faqs: (faqs.data ?? []).filter((f) => f.status === "pending").length,
            questions: asst.length,
            unanswered: unans.count ?? 0,
            low_confidence: asst.filter((m) => m.confidence === "low").length,
            medium_confidence: asst.filter((m) => m.confidence === "medium").length,
          },
          top_topics: Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([topic, count]) => ({ topic, count })),
          per_day: Object.values(perDay).sort((a, b) => a.day.localeCompare(b.day)),
          recent_documents: recentDocs.data ?? [],
          recent_policies: recentPols.data ?? [],
        });
      }
      case "analytics": {
        const { from, to } = range(p);
        const [msgs, fb, calc, emails, views, gaps] = await Promise.all([
          db.from("chat_messages").select("role,content,confidence,topic,department,sources,created_at").gte("created_at", from).lte("created_at", to).limit(30000),
          db.from("query_feedback").select("helpful,created_at").gte("created_at", from).lte("created_at", to),
          db.from("calculation_history").select("calculator,created_at").gte("created_at", from).lte("created_at", to),
          db.from("email_drafts").select("scenario,created_at").gte("created_at", from).lte("created_at", to),
          db.from("audit_logs").select("action,entity_id").in("action", ["policy_view", "policy_download"]).gte("created_at", from).lte("created_at", to),
          db.from("unanswered_queries").select("question,topic,ask_count,status").eq("status", "needs_review").order("ask_count", { ascending: false }).limit(200),
        ]);
        const ms = msgs.data ?? [];
        const users = ms.filter((m) => m.role === "user");
        const asst = ms.filter((m) => m.role === "assistant");
        const qCount: Record<string, { q: string; n: number }> = {};
        for (const u of users) { const k = u.content.trim().toLowerCase().replace(/[?.!]+$/, ""); qCount[k] ??= { q: u.content, n: 0 }; qCount[k].n++; }
        const dept: Record<string, number> = {};
        for (const u of users) { const d = u.department || "Not specified"; dept[d] = (dept[d] ?? 0) + 1; }
        const polViews: Record<string, number> = {};
        for (const a of asst) for (const s of (a.sources as any[]) ?? []) polViews[s.policy_name] = (polViews[s.policy_name] ?? 0) + 1;
        const { data: polNames } = await db.from("policies").select("id,name");
        const nameOf = Object.fromEntries((polNames ?? []).map((x) => [x.id, x.name]));
        for (const v of views.data ?? []) { const n = nameOf[v.entity_id ?? ""]; if (n) polViews[n] = (polViews[n] ?? 0) + 1; }
        const perDay: Record<string, any> = {};
        for (const a of asst) { const k = dayKey(a.created_at); perDay[k] ??= { day: k, high: 0, medium: 0, low: 0 }; perDay[k][a.confidence ?? "low"]++; }
        const count = (rows: any[], key: string) => Object.entries(rows.reduce((m: any, r: any) => { const k = r[key] ?? "Other"; m[k] = (m[k] ?? 0) + 1; return m; }, {})).map(([name, value]) => ({ name, value }));
        const gapTopics: Record<string, { topic: string; questions: number; asks: number }> = {};
        for (const g of gaps.data ?? []) { const t = g.topic || "Uncategorised"; gapTopics[t] ??= { topic: t, questions: 0, asks: 0 }; gapTopics[t].questions++; gapTopics[t].asks += g.ask_count; }
        return json({
          total_queries: users.length,
          confidence: { high: asst.filter((a) => a.confidence === "high").length, medium: asst.filter((a) => a.confidence === "medium").length, low: asst.filter((a) => a.confidence === "low").length },
          per_day: Object.values(perDay).sort((a: any, b: any) => a.day.localeCompare(b.day)),
          top_questions: Object.values(qCount).sort((a, b) => b.n - a.n).slice(0, 10).map((x) => ({ question: x.q.slice(0, 160), count: x.n })),
          most_viewed_policies: Object.entries(polViews).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value })),
          departments: Object.entries(dept).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          feedback: { helpful: (fb.data ?? []).filter((f) => f.helpful).length, not_helpful: (fb.data ?? []).filter((f) => !f.helpful).length },
          calculators: count(calc.data ?? [], "calculator"),
          emails: count(emails.data ?? [], "scenario"),
          knowledge_gaps: Object.values(gapTopics).sort((a, b) => b.asks - a.asks),
          top_gaps: (gaps.data ?? []).slice(0, 10),
        });
      }

      // ================= DOCUMENTS =================
      case "list_documents": {
        let q = db.from("documents").select("id,policy_id,kind,file_name,mime_type,size_bytes,status,progress,error,parent_document_id,created_at,updated_at,policies(name)").order("created_at", { ascending: false }).limit(300);
        if (p.status) q = q.in("status", Array.isArray(p.status) ? p.status : [p.status]);
        const { data } = await q;
        return json({ documents: data ?? [] });
      }
      case "create_upload": {
        const ext = extOf(p.file_name ?? "");
        if (![...SUPPORTED_EXT, "zip"].includes(ext)) return json({ error: `.${ext} files are not supported.` }, 400);
        if ((p.size ?? 0) > 50 * 1024 * 1024) return json({ error: "Files must be under 50 MB." }, 400);
        const id = crypto.randomUUID();
        const path = `uploads/${id}/${String(p.file_name).replace(/[^\w.\- ]/g, "_")}`;
        const { data: signed, error } = await db.storage.from("documents").createSignedUploadUrl(path);
        if (error) throw error;
        const kind = ["policy", "tax_rule", "pf_rule", "other"].includes(p.kind) ? p.kind : "policy";
        await db.from("documents").insert({ id, kind, file_name: p.file_name, storage_path: path, mime_type: p.mime ?? null, size_bytes: p.size ?? null, policy_id: p.target_policy_id ?? null, status: "uploaded" });
        await A("document_upload", "document", id, { file_name: p.file_name, kind });
        return json({ document_id: id, path, token: signed.token });
      }
      case "expand_zip": { const r = await expandZip(db, p.document_id); await A("zip_extract", "document", p.document_id, { files: r.created.length }); return json(r); }
      case "process_document": return json(await processDocument(db, p.document_id, p.target_policy_id));
      case "embed_version": return json(await embedVersion(db, p.version_id));
      case "embed_faqs": return json(await embedFaqs(db, p.version_id));
      case "generate_faqs": {
        let versionId = p.version_id;
        if (!versionId && p.policy_id) versionId = (await db.from("policies").select("current_version_id").eq("id", p.policy_id).single()).data?.current_version_id;
        if (!versionId) return json({ error: "Publish a version of this policy first." }, 400);
        const r = await generateFaqs(db, versionId);
        await A("faq_generate", "version", versionId, r);
        return json(r);
      }
      case "review_document": {
        const { data: doc } = await db.from("documents").select("*").eq("id", p.document_id).single();
        const { data: ver } = await db.from("document_versions").select("*").eq("document_id", p.document_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        let previous = null, faqs: any[] = [], chunks = 0, embedded = 0, policy = null;
        if (ver) {
          const { data: pol } = await db.from("policies").select("*").eq("id", ver.policy_id).single();
          policy = pol;
          if (pol?.current_version_id && pol.current_version_id !== ver.id) previous = (await db.from("document_versions").select("id,version_number,version_label,extracted_text").eq("id", pol.current_version_id).single()).data;
          faqs = (await db.from("faqs").select("id,question,short_answer,detailed_answer,section,status").eq("version_id", ver.id).order("created_at")).data ?? [];
          const { data: ch } = await db.from("document_chunks").select("id").eq("version_id", ver.id);
          chunks = ch?.length ?? 0;
          if (chunks) embedded = (await db.from("document_embeddings").select("chunk_id", { count: "exact", head: true }).in("chunk_id", ch!.map((c) => c.id))).count ?? 0;
        }
        return json({ document: doc, version: ver, previous, faqs, chunks, embedded, policy });
      }
      case "update_extracted_text": {
        const { data: v } = await db.from("document_versions").select("policy_id,approval_status").eq("id", p.version_id).single();
        if (v?.approval_status !== "pending") return json({ error: "Only pending versions can be edited." }, 400);
        await db.from("document_versions").update({ extracted_text: p.text, updated_at: now() }).eq("id", p.version_id);
        const chunks = await rechunk(db, p.version_id, v.policy_id, p.text);
        await A("version_text_edit", "version", p.version_id, { chunks });
        return json({ chunks });
      }
      case "publish_version": {
        const { data: v } = await db.from("document_versions").select("*").eq("id", p.version_id).single();
        if (!v) return json({ error: "Version not found" }, 404);
        const { data: ch } = await db.from("document_chunks").select("id").eq("version_id", v.id);
        const embedded = ch?.length ? (await db.from("document_embeddings").select("chunk_id", { count: "exact", head: true }).in("chunk_id", ch.map((c) => c.id))).count ?? 0 : 0;
        if (!ch?.length || embedded < ch.length) return json({ error: "Indexing is not finished for this version. Run indexing before publishing." }, 400);
        const meta = p.metadata ?? {};
        await db.from("document_versions").update({ approval_status: "superseded" }).eq("policy_id", v.policy_id).eq("approval_status", "approved");
        await db.from("document_versions").update({
          approval_status: "approved", published_at: now(), updated_at: now(), updated_by: actor,
          title: meta.title ?? v.title, category: meta.category ?? v.category, version_label: meta.version_label ?? v.version_label,
          effective_date: meta.effective_date || v.effective_date,
        }).eq("id", v.id);
        const { data: pol } = await db.from("policies").select("status,current_version_id").eq("id", v.policy_id).single();
        // Old-version FAQs never mix with the new version
        if (pol?.current_version_id && pol.current_version_id !== v.id)
          await db.from("faqs").update({ status: "superseded", updated_at: now() }).eq("policy_id", v.policy_id).neq("version_id", v.id).in("status", ["approved", "pending"]);
        const polPatch: Record<string, unknown> = { current_version_id: v.id, updated_at: now(), status: pol?.status === "inactive" && !p.activate ? "inactive" : "active" };
        if (meta.title) { polPatch.name = meta.title; }
        if (meta.category) polPatch.category = meta.category;
        if (meta.description !== undefined) polPatch.description = meta.description;
        await db.from("policies").update(polPatch).eq("id", v.policy_id);
        if (p.approve_faqs) await db.from("faqs").update({ status: "approved", updated_at: now() }).eq("version_id", v.id).eq("status", "pending");
        if (v.document_id) await db.from("documents").update({ status: "published", progress: 100, updated_at: now() }).eq("id", v.document_id);
        await A("version_publish", "policy", v.policy_id, { version_id: v.id, version: v.version_number });
        return json({ ok: true });
      }
      case "reject_version": {
        const { data: v } = await db.from("document_versions").select("document_id,policy_id").eq("id", p.version_id).single();
        await db.from("document_versions").update({ approval_status: "rejected", updated_at: now() }).eq("id", p.version_id);
        await db.from("faqs").update({ status: "rejected" }).eq("version_id", p.version_id).eq("status", "pending");
        if (v?.document_id) await db.from("documents").update({ status: "rejected", updated_at: now() }).eq("id", v.document_id);
        const { data: pol } = await db.from("policies").select("current_version_id").eq("id", v!.policy_id).single();
        if (!pol?.current_version_id) await db.from("policies").delete().eq("id", v!.policy_id).eq("status", "draft");
        await A("version_reject", "version", p.version_id);
        return json({ ok: true });
      }
      case "delete_document": {
        const { data: d } = await db.from("documents").select("storage_path,status").eq("id", p.document_id).single();
        if (d?.status === "published") return json({ error: "Published documents are kept for history. Archive the policy instead." }, 400);
        const { data: vs } = await db.from("document_versions").select("id,policy_id,approval_status").eq("document_id", p.document_id);
        for (const v of vs ?? []) if (v.approval_status !== "approved" && v.approval_status !== "superseded") await db.from("document_versions").delete().eq("id", v.id);
        if (d?.storage_path) await db.storage.from("documents").remove([d.storage_path]);
        await db.from("documents").delete().eq("id", p.document_id);
        await db.from("policies").delete().eq("status", "draft").is("current_version_id", null);
        await A("document_delete", "document", p.document_id);
        return json({ ok: true });
      }
      case "document_url": {
        const { data: d } = await db.from("documents").select("storage_path,file_name").eq("id", p.document_id).single();
        const { data: s, error } = await db.storage.from("documents").createSignedUrl(d!.storage_path, 300);
        if (error) throw error;
        return json({ url: s.signedUrl });
      }

      // ================= POLICIES & VERSIONS =================
      case "list_policies": {
        const { data: pols } = await db.from("policies").select("*, current:document_versions!policies_current_version_fk(version_number,version_label,effective_date,published_at)").order("name");
        const { data: fq } = await db.from("faqs").select("policy_id,status");
        const { data: vs } = await db.from("document_versions").select("policy_id,approval_status");
        const stat = (id: string) => ({
          approved_faqs: (fq ?? []).filter((f) => f.policy_id === id && f.status === "approved").length,
          pending_faqs: (fq ?? []).filter((f) => f.policy_id === id && f.status === "pending").length,
          versions: (vs ?? []).filter((v) => v.policy_id === id).length,
          pending_versions: (vs ?? []).filter((v) => v.policy_id === id && v.approval_status === "pending").length,
        });
        return json({ policies: (pols ?? []).map((x) => ({ ...x, ...stat(x.id) })) });
      }
      case "set_policy_status": {
        if (!["active", "inactive", "archived"].includes(p.status)) return json({ error: "Invalid status" }, 400);
        const { data: pol } = await db.from("policies").select("current_version_id").eq("id", p.policy_id).single();
        if (p.status === "active" && !pol?.current_version_id) return json({ error: "Publish a version before activating this policy." }, 400);
        await db.from("policies").update({ status: p.status, updated_at: now() }).eq("id", p.policy_id);
        await A(`policy_${p.status}`, "policy", p.policy_id);
        return json({ ok: true });
      }
      case "update_policy": {
        const patch: Record<string, unknown> = { updated_at: now() };
        for (const k of ["name", "category", "description", "downloadable"]) if (p[k] !== undefined) patch[k] = p[k];
        if (p.name) patch.slug = slugify(p.name);
        await db.from("policies").update(patch).eq("id", p.policy_id);
        await A("policy_update", "policy", p.policy_id, patch);
        return json({ ok: true });
      }
      case "list_versions": {
        const { data } = await db.from("document_versions").select("id,version_number,version_label,title,effective_date,change_summary,approval_status,updated_by,published_at,created_at,updated_at,document_id,documents(file_name)").eq("policy_id", p.policy_id).order("version_number", { ascending: false });
        return json({ versions: data ?? [] });
      }
      case "version_text": {
        const { data } = await db.from("document_versions").select("id,version_number,version_label,extracted_text").in("id", p.version_ids);
        return json({ versions: data ?? [] });
      }

      // ================= FAQs =================
      case "list_faqs": {
        let q = db.from("faqs").select("id,policy_id,version_id,question,short_answer,detailed_answer,section,related_questions,status,source,view_count,updated_at,policies(name)").order("updated_at", { ascending: false }).limit(1000);
        if (p.policy_id) q = q.eq("policy_id", p.policy_id);
        if (p.status) q = q.eq("status", p.status);
        const { data } = await q;
        return json({ faqs: data ?? [] });
      }
      case "upsert_faq": {
        if (!p.question?.trim() || !p.policy_id) return json({ error: "Question and policy are required." }, 400);
        const [vec] = await embed([`${p.question}\n${p.short_answer ?? ""}`]);
        const row = { policy_id: p.policy_id, question: p.question.trim(), short_answer: p.short_answer ?? null, detailed_answer: p.detailed_answer ?? null,
          section: p.section ?? null, related_questions: p.related_questions ?? [], status: p.status ?? "approved", embedding: toVector(vec), updated_at: now() };
        let id = p.id;
        if (id) {
          const { data: old } = await db.from("faqs").select("question,short_answer,detailed_answer,section,status,related_questions").eq("id", id).single();
          await db.from("faq_versions").insert({ faq_id: id, snapshot: old, changed_by: actor });
          await db.from("faqs").update(row).eq("id", id);
        } else {
          const { data: pol } = await db.from("policies").select("current_version_id").eq("id", p.policy_id).single();
          const { data } = await db.from("faqs").insert({ ...row, version_id: pol?.current_version_id ?? null, source: p.source ?? "admin" }).select("id").single();
          id = data!.id;
        }
        await A(p.id ? "faq_edit" : "faq_create", "faq", id, { question: p.question });
        return json({ id });
      }
      case "set_faq_status": {
        await db.from("faqs").update({ status: p.status, updated_at: now() }).in("id", p.ids);
        await A(`faq_${p.status}`, "faq", null, { ids: p.ids });
        return json({ ok: true });
      }
      case "delete_faq": { await db.from("faqs").delete().eq("id", p.id); await A("faq_delete", "faq", p.id); return json({ ok: true }); }
      case "faq_history": { const { data } = await db.from("faq_versions").select("*").eq("faq_id", p.faq_id).order("created_at", { ascending: false }); return json({ history: data ?? [] }); }

      // ================= KNOWLEDGE BASE =================
      case "list_unanswered": {
        let q = db.from("unanswered_queries").select("id,question,topic,ask_count,confidence,closest_content,status,linked_policy_id,approved_answer,faq_id,first_asked_at,last_asked_at").order("ask_count", { ascending: false }).order("last_asked_at", { ascending: false }).limit(300);
        if (p.status) q = q.eq("status", p.status);
        const { data } = await q;
        return json({ items: data ?? [] });
      }
      case "resolve_unanswered": {
        const patch: Record<string, unknown> = {};
        if (p.mode === "unsupported") patch.status = "unsupported";
        if (p.mode === "link") { patch.status = "linked"; patch.linked_policy_id = p.policy_id; }
        if (p.mode === "answer") {
          if (!p.policy_id || !p.answer?.trim()) return json({ error: "Choose a policy and write the approved answer." }, 400);
          patch.status = "answered"; patch.approved_answer = p.answer; patch.linked_policy_id = p.policy_id;
          if (p.create_faq !== false) {
            const { data: u } = await db.from("unanswered_queries").select("question").eq("id", p.id).single();
            const q = p.question?.trim() || u!.question;
            const [vec] = await embed([`${q}\n${p.answer}`]);
            const { data: pol } = await db.from("policies").select("current_version_id").eq("id", p.policy_id).single();
            const { data: f } = await db.from("faqs").insert({ policy_id: p.policy_id, version_id: pol?.current_version_id ?? null, question: q, short_answer: p.answer.split(/(?<=\.)\s/)[0], detailed_answer: p.answer, status: "approved", source: "knowledge_gap", embedding: toVector(vec) }).select("id").single();
            patch.faq_id = f?.id;
          }
        }
        await db.from("unanswered_queries").update(patch).eq("id", p.id);
        await A(`gap_${p.mode}`, "unanswered_query", p.id, patch);
        return json({ ok: true });
      }
      case "low_confidence": {
        const { data: as } = await db.from("chat_messages").select("id,session_id,content,confidence,sources,unanswered_parts,created_at").eq("role", "assistant").in("confidence", p.levels ?? ["low", "medium"]).order("created_at", { ascending: false }).limit(150);
        const sids = [...new Set((as ?? []).map((a) => a.session_id))];
        const { data: us } = sids.length ? await db.from("chat_messages").select("session_id,content,created_at").eq("role", "user").in("session_id", sids) : { data: [] as any[] };
        const items = (as ?? []).map((a) => {
          const q = (us ?? []).filter((u) => u.session_id === a.session_id && u.created_at <= a.created_at).sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
          return { id: a.id, question: q?.content ?? "", answer: a.content, confidence: a.confidence, unanswered_parts: a.unanswered_parts, sources: (a.sources as any[])?.map((s) => s.policy_name) ?? [], created_at: a.created_at };
        });
        return json({ items });
      }
      case "feedback_list": {
        const { data } = await db.from("query_feedback").select("id,helpful,comment,created_at,chat_messages(content,confidence,sources)").order("created_at", { ascending: false }).limit(200);
        return json({ items: data ?? [] });
      }
      case "escalations": {
        const { data } = await db.from("chat_messages").select("id,contact,topic,confidence,created_at").eq("role", "assistant").not("contact", "is", null).order("created_at", { ascending: false }).limit(300);
        const by: Record<string, number> = {};
        for (const m of data ?? []) { const c = (m.contact as any)?.escalation_category ?? "general_hr"; by[c] = (by[c] ?? 0) + 1; }
        return json({ by_category: Object.entries(by).map(([name, value]) => ({ name, value })), recent: (data ?? []).slice(0, 50) });
      }

      // ================= CALCULATOR RULES =================
      case "list_calc_rules": {
        const [c, t, pf, s] = await Promise.all([
          db.from("calculator_rule_versions").select("*").order("calculator").order("version", { ascending: false }),
          db.from("tax_rules").select("*").order("financial_year", { ascending: false }).order("regime").order("version", { ascending: false }),
          db.from("pf_rules").select("*").order("version", { ascending: false }),
          db.from("calculator_settings").select("*"),
        ]);
        return json({ calculator: c.data ?? [], tax: t.data ?? [], pf: pf.data ?? [], settings: s.data ?? [] });
      }
      case "save_calc_rule": {
        const { data: last } = await db.from("calculator_rule_versions").select("version").eq("calculator", p.calculator).order("version", { ascending: false }).limit(1);
        const { data, error } = await db.from("calculator_rule_versions").insert({ calculator: p.calculator, version: (last?.[0]?.version ?? 0) + 1, config: p.config, notes: p.notes ?? null, effective_from: p.effective_from || null, status: "draft" }).select("id").single();
        if (error) throw error;
        await A("calc_rule_draft", "calculator_rule", data.id, { calculator: p.calculator });
        return json({ id: data.id });
      }
      case "publish_calc_rule": {
        const { data: r } = await db.from("calculator_rule_versions").select("calculator").eq("id", p.id).single();
        await db.from("calculator_rule_versions").update({ status: "inactive" }).eq("calculator", r!.calculator).eq("status", "published");
        await db.from("calculator_rule_versions").update({ status: "published", approved_by: actor, approved_at: now() }).eq("id", p.id);
        await A("calc_rule_publish", "calculator_rule", p.id, { calculator: r!.calculator });
        return json({ ok: true });
      }
      case "deactivate_calc_rule": { await db.from("calculator_rule_versions").update({ status: "inactive" }).eq("id", p.id); await A("calc_rule_deactivate", "calculator_rule", p.id); return json({ ok: true }); }
      case "save_tax_rule": {
        const { data: last } = await db.from("tax_rules").select("version").eq("financial_year", p.financial_year).eq("regime", p.regime).order("version", { ascending: false }).limit(1);
        const { data, error } = await db.from("tax_rules").insert({ financial_year: p.financial_year, regime: p.regime, version: (last?.[0]?.version ?? 0) + 1, rules: p.rules, source: p.source ?? null, effective_from: p.effective_from || null, effective_to: p.effective_to || null, notes: p.notes ?? null, status: "draft", verified: false }).select("id").single();
        if (error) throw error;
        await A("tax_rule_draft", "tax_rule", data.id, { fy: p.financial_year, regime: p.regime });
        return json({ id: data.id });
      }
      case "publish_tax_rule": {
        const { data: r } = await db.from("tax_rules").select("financial_year,regime").eq("id", p.id).single();
        await db.from("tax_rules").update({ status: "inactive" }).eq("financial_year", r!.financial_year).eq("regime", r!.regime).eq("status", "published");
        await db.from("tax_rules").update({ status: "published", verified: !!p.verified, verified_at: p.verified ? now() : null, updated_at: now() }).eq("id", p.id);
        await A("tax_rule_publish", "tax_rule", p.id, { ...r, verified: !!p.verified });
        return json({ ok: true });
      }
      case "deactivate_tax_rule": { await db.from("tax_rules").update({ status: "inactive", updated_at: now() }).eq("id", p.id); await A("tax_rule_deactivate", "tax_rule", p.id); return json({ ok: true }); }
      case "save_pf_rule": {
        const { data: last } = await db.from("pf_rules").select("version").order("version", { ascending: false }).limit(1);
        const { data, error } = await db.from("pf_rules").insert({ version: (last?.[0]?.version ?? 0) + 1, rules: p.rules, source: p.source ?? null, effective_from: p.effective_from || null, notes: p.notes ?? null, status: "draft" }).select("id").single();
        if (error) throw error;
        await A("pf_rule_draft", "pf_rule", data.id);
        return json({ id: data.id });
      }
      case "publish_pf_rule": {
        await db.from("pf_rules").update({ status: "inactive" }).eq("status", "published");
        await db.from("pf_rules").update({ status: "published", verified: !!p.verified, verified_at: p.verified ? now() : null, updated_at: now() }).eq("id", p.id);
        await A("pf_rule_publish", "pf_rule", p.id, { verified: !!p.verified });
        return json({ ok: true });
      }
      case "deactivate_pf_rule": { await db.from("pf_rules").update({ status: "inactive", updated_at: now() }).eq("id", p.id); await A("pf_rule_deactivate", "pf_rule", p.id); return json({ ok: true }); }
      case "calc_history": {
        const { from, to } = range(p);
        const { data } = await db.from("calculation_history").select("id,calculator,department,rule_version_ref,outputs,created_at").gte("created_at", from).lte("created_at", to).order("created_at", { ascending: false }).limit(300);
        return json({ items: data ?? [] });
      }

      // ================= CONTACTS / ANNOUNCEMENTS / SETTINGS / AUDIT =================
      case "list_contacts": { const { data } = await db.from("contact_directory").select("*").order("escalation_category"); return json({ contacts: data ?? [] }); }
      case "upsert_contact": {
        if (!p.name?.trim() || !CONTACT_CATEGORIES.includes(p.escalation_category)) return json({ error: "Name and escalation category are required." }, 400);
        const row = { name: p.name.trim(), phone: p.phone || null, email: p.email || null, department: p.department || null, escalation_category: p.escalation_category, availability: p.availability || null, is_active: p.is_active ?? true, updated_at: now() };
        if (p.is_default) await db.from("contact_directory").update({ is_default: false }).eq("is_default", true);
        const { data } = p.id
          ? await db.from("contact_directory").update({ ...row, is_default: !!p.is_default }).eq("id", p.id).select("id").single()
          : await db.from("contact_directory").insert({ ...row, is_default: !!p.is_default }).select("id").single();
        await A(p.id ? "contact_edit" : "contact_create", "contact", data?.id ?? null, row);
        return json({ id: data?.id });
      }
      case "delete_contact": { await db.from("contact_directory").delete().eq("id", p.id); await A("contact_delete", "contact", p.id); return json({ ok: true }); }
      case "list_announcements": { const { data } = await db.from("announcements").select("*").order("created_at", { ascending: false }); return json({ items: data ?? [] }); }
      case "upsert_announcement": {
        if (!p.title?.trim()) return json({ error: "Title is required." }, 400);
        const row = { title: p.title.trim(), body: p.body ?? null, priority: p.priority ?? "normal", is_active: p.is_active ?? true, starts_at: p.starts_at || now(), ends_at: p.ends_at || null };
        const { data } = p.id ? await db.from("announcements").update(row).eq("id", p.id).select("id").single() : await db.from("announcements").insert(row).select("id").single();
        await A(p.id ? "announcement_edit" : "announcement_create", "announcement", data?.id ?? null, { title: row.title });
        return json({ id: data?.id });
      }
      case "delete_announcement": { await db.from("announcements").delete().eq("id", p.id); await A("announcement_delete", "announcement", p.id); return json({ ok: true }); }
      case "list_settings": { const { data } = await db.from("system_settings").select("*").order("key"); return json({ settings: data ?? [] }); }
      case "set_setting": {
        await db.from("system_settings").upsert({ key: p.key, value: p.value, is_public: !!p.is_public, updated_at: now() });
        await A("setting_update", "setting", p.key, { value: p.value });
        return json({ ok: true });
      }
      case "audit_logs": {
        const page = Math.max(0, p.page ?? 0);
        let q = db.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(page * 50, page * 50 + 49);
        if (p.action) q = q.ilike("action", `%${p.action}%`);
        const { data, count } = await q;
        return json({ items: data ?? [], total: count ?? 0 });
      }
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Something went wrong" }, 500);
  }
});
