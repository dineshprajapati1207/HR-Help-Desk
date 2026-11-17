import { corsHeaders, json, serviceClient, resolveContact } from "../_shared/common.ts";
import { embed, toVector } from "../_shared/llm.ts";
import { canon, contactCategory, extractAnswer, tokens } from "../_shared/nlp.ts";

type Hit = { chunk_id: string; policy_id: string; policy_name: string; category: string; version_label: string | null;
  version_number: number; effective_date: string | null; published_at: string | null; section: string | null; content: string; score: number };

// Answer order (no AI, nothing is made up):
//  1. an approved Q&A whose question matches -> its answer, exactly as written
//  2. otherwise the exact sentences of the relevant policy
//  3. otherwise the "please contact HR" message; HR contact details are shared only after the employee says yes
const NOT_FOUND = "For this information, please contact HR. If you would like the HR contact details, I can share them with you.";
const YES = /^\s*(yes|yeah|yep|yup|sure|ok|okay|please|haan|ha|y)\b/i;
const NO = /^\s*(no|nope|nah|not now|no thanks|no thank you|n)\b/i;

// ---- approved Q&A list, cached for a minute so each question does not reload it ----
type QaRow = { id: string; policy_id: string; policy_name: string; question: string; toks: string[] };
let qaCache: { at: number; rows: QaRow[]; df: Map<string, number> } | null = null;
async function loadQa(db: ReturnType<typeof serviceClient>) {
  if (qaCache && Date.now() - qaCache.at < 60_000) return qaCache;
  const rows: QaRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await db.from("public_faqs").select("id,policy_id,policy_name,question").order("id").range(from, from + 999);
    for (const r of data ?? []) rows.push({ ...r, toks: canon(r.question) });
    if ((data?.length ?? 0) < 1000) break;
  }
  const df = new Map<string, number>();
  for (const r of rows) for (const t of r.toks) df.set(t, (df.get(t) ?? 0) + 1);
  return (qaCache = { at: Date.now(), rows, df });
}
const lexScore = (a: string[], b: string[], df: Map<string, number>, n: number) => {
  const w = (t: string) => Math.log(1 + n / (1 + (df.get(t) ?? 0)));
  const A = new Set(a), B = new Set(b);
  let inter = 0, uni = 0;
  for (const t of new Set([...A, ...B])) { const x = w(t); uni += x; if (A.has(t) && B.has(t)) inter += x; }
  return uni ? inter / uni : 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = serviceClient();
    const { message, session_id, client_id, policy_id, department, regenerate } = await req.json();
    if (!message || typeof message !== "string" || message.length > 2000) return json({ error: "Please enter a question (max 2000 characters)." }, 400);
    if (!client_id) return json({ error: "client_id required" }, 400);

    // session
    let sid = session_id as string | null;
    if (sid) {
      const { data: s } = await db.from("chat_sessions").select("id,client_id").eq("id", sid).maybeSingle();
      if (!s || s.client_id !== client_id) sid = null;
    }
    if (!sid) {
      const { data: s, error } = await db.from("chat_sessions").insert({ client_id, title: message.slice(0, 80), department }).select("id").single();
      if (error) throw error;
      sid = s.id;
    }
    const { data: history } = await db.from("chat_messages").select("role,content").eq("session_id", sid).order("created_at", { ascending: false }).limit(6);
    const hist = (history ?? []).reverse();
    const save = async (answer: string, extra: Record<string, unknown>) => {
      if (!regenerate) await db.from("chat_messages").insert({ session_id: sid, role: "user", content: message, department });
      const { data: saved } = await db.from("chat_messages").insert({ session_id: sid, role: "assistant", content: answer, department, ...extra }).select("id,created_at").single();
      await db.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sid);
      return saved;
    };

    // ---- the employee answers "do you want the HR contact details?" ----
    const lastAssistant = [...hist].reverse().find((h) => h.role === "assistant")?.content ?? "";
    if (lastAssistant.startsWith("For this information, please contact HR") && message.length < 80) {
      const yes = YES.test(message) || /\b(share|contact details|contact number)\b/i.test(message);
      if (yes && !NO.test(message)) {
        const c = await resolveContact(db, "general_hr");
        const name = c?.name ?? "Apurv Christian", phone = c?.phone || "6358929782", email = c?.email || "hr@petpooja.com";
        const answer = `* Name: ${name}\n* Contact Number: ${phone}\n* Email ID: ${email}`;
        const saved = await save(answer, { confidence: "high", topic: "HR contact", sources: [], related_questions: [], contact: c ?? null });
        return json({ session_id: sid, message_id: saved?.id, created_at: saved?.created_at, answer, confidence: "high", kind: "contact", sources: [], related_questions: [], unanswered_parts: "", topic: "HR contact", contact: c ?? null, is_posh: false });
      }
      if (NO.test(message)) {
        const answer = "Okay. Please ask me if you have any other question about a company policy.";
        const saved = await save(answer, { confidence: "high", topic: "", sources: [], related_questions: [], contact: null });
        return json({ session_id: sid, message_id: saved?.id, created_at: saved?.created_at, answer, confidence: "high", kind: "info", sources: [], related_questions: [], unanswered_parts: "", topic: "", contact: null, is_posh: false });
      }
    }

    // short follow-ups ("and for interns?") are joined to the previous question
    let standalone = message;
    const lastUser = [...hist].reverse().find((h) => h.role === "user")?.content;
    if (lastUser && tokens(message).length < 3) standalone = `${lastUser} ${message}`;

    // ===== STEP 1: approved Q&A =====
    const [qa, [qVec]] = await Promise.all([loadQa(db), embed([standalone])]);
    const vec = toVector(qVec);
    const qT = canon(standalone);
    const scoped = (r: { policy_id: string }) => !policy_id || r.policy_id === policy_id;
    const cands = new Map<string, { id: string; question: string; policy_id: string; sim: number; lex: number }>();
    for (const r of qa.rows.filter(scoped).map((r) => ({ r, lex: lexScore(qT, r.toks, qa.df, qa.rows.length) })).sort((a, b) => b.lex - a.lex).slice(0, 6))
      cands.set(r.r.id, { id: r.r.id, question: r.r.question, policy_id: r.r.policy_id, sim: 0, lex: r.lex });
    const { data: fq } = await db.rpc("match_faqs", { query_embedding: vec, match_count: 5 });
    for (const f of ((fq ?? []) as any[]).filter(scoped)) {
      const ex = cands.get(f.faq_id);
      if (ex) ex.sim = f.similarity;
      else cands.set(f.faq_id, { id: f.faq_id, question: f.question, policy_id: f.policy_id, sim: f.similarity, lex: lexScore(qT, canon(f.question), qa.df, qa.rows.length) });
    }
    const ranked = [...cands.values()].sort((a, b) => (b.lex + b.sim * 0.6) - (a.lex + a.sim * 0.6));
    const match = ranked.find((c) => c.sim >= 0.9 || c.lex >= 0.7 || (c.sim >= 0.86 && c.lex >= 0.5));
    const similarQs = ranked.filter((c) => c.id !== match?.id && (c.lex >= 0.35 || c.sim >= 0.84)).map((c) => c.question).slice(0, 3);

    let answer = "", kind: "qa" | "policy" | "not_found" = "not_found", topic = "";
    let sourcesOut: Record<string, unknown>[] = [];

    if (match) {
      const { data: row } = await db.from("public_faqs").select("id,policy_id,policy_name,category,question,short_answer,detailed_answer,section").eq("id", match.id).maybeSingle();
      if (row) {
        const parts = [row.short_answer, row.detailed_answer].filter((x): x is string => !!x && !!x.trim());
        answer = parts.length === 2 && parts[0].trim() !== parts[1].trim() ? `${parts[0]}\n\n${parts[1]}` : parts[0] ?? "";
        if (answer) {
          kind = "qa"; topic = row.policy_name;
          sourcesOut = [{ chunk_id: row.id, policy_id: row.policy_id, policy_name: row.policy_name, category: row.category, version: "Q&A", effective_date: null, last_updated: null,
            section: row.section, excerpt: `Q: ${row.question}\nA: ${answer}`, kind: "qa" }];
        }
      }
    }

    // ===== STEP 2: the policy document itself =====
    let hits: Hit[] = [];
    if (!answer) {
      const [sem, kw] = await Promise.all([
        db.rpc("match_policy_chunks", { query_embedding: vec, match_count: 8, filter_policy: policy_id ?? null }),
        db.rpc("keyword_policy_chunks", { query_text: standalone, match_count: 6, filter_policy: policy_id ?? null }),
      ]);
      const map = new Map<string, Hit>();
      for (const r of (sem.data ?? []) as any[]) map.set(r.chunk_id, { ...r, score: r.similarity });
      for (const r of (kw.data ?? []) as any[]) { const ex = map.get(r.chunk_id); if (ex) ex.score += 0.05; else map.set(r.chunk_id, { ...r, score: Math.min(0.5, 0.3 + r.rank) }); }
      hits = [...map.values()].sort((a, b) => b.score - a.score).slice(0, 7);

      // read the full current text of the best matching policy(ies)
      const scans: { meta: Hit; chunks: { id: string; section: string | null; content: string; score: number }[] }[] = [];
      for (const pid of [...new Set([...(policy_id ? [policy_id as string] : []), ...hits.map((h) => h.policy_id)])].slice(0, 2)) {
        const { data: pol } = await db.from("policies").select("name,category,current_version_id").eq("id", pid).eq("status", "active").maybeSingle();
        if (!pol?.current_version_id) continue;
        const [{ data: ver }, { data: ch }] = await Promise.all([
          db.from("document_versions").select("version_label,version_number,effective_date,published_at").eq("id", pol.current_version_id).maybeSingle(),
          db.from("document_chunks").select("id,section,content").eq("version_id", pol.current_version_id).order("chunk_index"),
        ]);
        if (!ch?.length) continue;
        scans.push({ meta: { chunk_id: "", policy_id: pid, policy_name: pol.name, category: pol.category, version_label: ver?.version_label ?? null, version_number: ver?.version_number ?? 1,
          effective_date: ver?.effective_date ?? null, published_at: ver?.published_at ?? null, section: null, content: "", score: 0 }, chunks: ch.map((c) => ({ ...c, score: 0 })) });
      }
      let best: { r: ReturnType<typeof extractAnswer>; meta: Hit } | null = null;
      for (const sc of scans) {
        const r = extractAnswer(standalone, sc.chunks, { scan: true });
        if (r.answer && (!best || r.coverage > best.r.coverage)) best = { r, meta: sc.meta };
      }
      if (best && best.r.coverage >= 0.5) {
        answer = best.r.answer; kind = "policy"; topic = best.meta.policy_name;
        // each source card carries the exact policy wording (up to 3 places in the policy)
        const sc = scans.find((s) => s.meta.policy_id === best!.meta.policy_id)!;
        sourcesOut = sc.chunks.map((c) => ({ c, r: extractAnswer(standalone, [c], { scan: true }) }))
          .filter((x) => x.r.answer && x.r.coverage >= 0.34).sort((a, b) => b.r.coverage - a.r.coverage).slice(0, 3)
          .map((x) => ({ chunk_id: x.c.id, policy_id: sc.meta.policy_id, policy_name: sc.meta.policy_name, category: sc.meta.category, version: sc.meta.version_label ?? `v${sc.meta.version_number}`,
            effective_date: sc.meta.effective_date, last_updated: sc.meta.published_at, section: x.c.section, excerpt: x.r.answer, kind: "policy" }));
      }
    }

    // ===== STEP 3: not available =====
    const notFound = !answer;
    if (notFound) answer = NOT_FOUND;
    const isPosh = /posh|harass|inappropriate|sexual|misconduct|molest/i.test(`${topic} ${message}`);
    const related = similarQs;
    if (!topic) topic = hits[0]?.policy_name ?? "";
    void contactCategory;

    const saved = await save(answer, { confidence: notFound ? "low" : "high", topic, sources: sourcesOut, related_questions: related, unanswered_parts: null, contact: null });

    // knowledge-gap logging (deduplicated semantically)
    if (notFound && !regenerate) {
      const { data: dup } = await db.rpc("match_unanswered", { query_embedding: vec, threshold: 0.9 });
      const closest = hits.slice(0, 3).map((h) => ({ policy_name: h.policy_name, section: h.section, excerpt: h.content.slice(0, 400), score: Number(h.score.toFixed(3)) }));
      if (dup?.length) {
        const { data: u } = await db.from("unanswered_queries").select("ask_count").eq("id", dup[0].id).single();
        await db.from("unanswered_queries").update({ ask_count: (u?.ask_count ?? 1) + 1, last_asked_at: new Date().toISOString(), confidence: "low" }).eq("id", dup[0].id);
      } else {
        await db.from("unanswered_queries").insert({ question: message, topic, confidence: "low", closest_content: closest, embedding: vec });
      }
    }

    return json({
      session_id: sid, message_id: saved?.id, created_at: saved?.created_at,
      answer, confidence: notFound ? "low" : "high", kind, not_found: notFound, sources: sourcesOut, related_questions: related, unanswered_parts: "", topic, contact: null, is_posh: isPosh,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Something went wrong" }, 500);
  }
});
