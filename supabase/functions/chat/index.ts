import { corsHeaders, json, serviceClient, resolveContact } from "../_shared/common.ts";
import { embed, toVector } from "../_shared/llm.ts";
import { contactCategory, extractAnswer, faqLexical, tokens } from "../_shared/nlp.ts";

type Hit = { chunk_id: string; policy_id: string; policy_name: string; category: string; version_label: string | null;
  version_number: number; effective_date: string | null; published_at: string | null; section: string | null; content: string; score: number };

// No AI service: answers are sentences taken straight from the uploaded policy (or its approved FAQ).

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

    // 1) short follow-ups ("and for interns?") are joined to the previous question so retrieval has context
    let standalone = message;
    const lastUser = [...hist].reverse().find((h) => h.role === "user")?.content;
    if (lastUser && tokens(message).length < 3) standalone = `${lastUser} ${message}`;

    // 2) hybrid retrieval: vector + keyword + approved FAQs
    const [qVec] = await embed([standalone]);
    const vec = toVector(qVec);
    const [sem, kw, fq, th] = await Promise.all([
      db.rpc("match_policy_chunks", { query_embedding: vec, match_count: 8, filter_policy: policy_id ?? null }),
      db.rpc("keyword_policy_chunks", { query_text: standalone, match_count: 6, filter_policy: policy_id ?? null }),
      db.rpc("match_faqs", { query_embedding: vec, match_count: 3 }),
      db.from("system_settings").select("value").eq("key", "confidence_thresholds").maybeSingle(),
    ]);
    const thresholds = (th.data?.value as { high: number; medium: number }) ?? { high: 0.55, medium: 0.4 };
    const map = new Map<string, Hit>();
    for (const r of (sem.data ?? []) as any[]) map.set(r.chunk_id, { ...r, score: r.similarity });
    for (const r of (kw.data ?? []) as any[]) {
      const ex = map.get(r.chunk_id);
      if (ex) ex.score += 0.05; else map.set(r.chunk_id, { ...r, score: Math.min(0.5, 0.3 + r.rank) });
    }
    const hits = [...map.values()].sort((a, b) => b.score - a.score).slice(0, 7);
    const faqHits = ((fq.data ?? []) as any[]).filter((f) => f.similarity >= thresholds.medium);
    const topScore = Math.max(hits[0]?.score ?? 0, faqHits[0]?.similarity ?? 0);

    let answer = "", confidence: "high" | "medium" | "low" = "low", unanswered = "", related: string[] = [], topic = "", contactCat = "general_hr";
    let used: Hit[] = [];
    let srcQuery = message === standalone ? message : standalone;

    // read the full current text of the best matching policy(ies), not only the top search hits
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

    if (hits.length || faqHits.length || scans.length) {
      // a) an approved FAQ that matches the question closely answers it directly
      const f0 = faqHits[0];
      const faqDirect = f0 && (f0.similarity >= Math.max(thresholds.high, 0.88) || (f0.similarity >= thresholds.medium && faqLexical(message, f0.question) >= 0.6));
      if (faqDirect) {
        answer = f0.short_answer && f0.detailed_answer && f0.detailed_answer !== f0.short_answer ? `${f0.short_answer}\n\n${f0.detailed_answer}` : (f0.detailed_answer ?? f0.short_answer ?? "");
        confidence = "high"; topic = f0.policy_name; srcQuery = `${message} ${f0.question}`;
        const same = hits.find((h) => h.policy_id === f0.policy_id);
        used = same ? [same] : hits.slice(0, 1);
      } else {
        // b) read the whole policy and give the sentences that answer the question, word for word
        const q = message === standalone ? message : standalone;
        let best: { r: ReturnType<typeof extractAnswer>; hit: Hit } | null = null;
        for (const sc of scans) {
          const r = extractAnswer(q, sc.chunks, { scan: true });
          if (r.answer && (!best || r.coverage > best.r.coverage)) {
            const ch = sc.chunks[Math.max(0, r.from)];
            best = { r, hit: { ...sc.meta, chunk_id: ch.id, section: ch.section, content: ch.content } };
          }
        }
        if (!best) { const r = extractAnswer(q, hits); if (r.answer && hits[Math.max(0, r.from)]) best = { r, hit: hits[Math.max(0, r.from)] }; }
        if (best && best.r.coverage >= 0.34) {
          answer = best.r.answer; used = [best.hit]; topic = best.hit.policy_name;
          confidence = best.r.coverage >= 0.6 ? "high" : "medium";
          if (confidence === "medium") unanswered = "The policy may not answer every part of your question. Please check the source below or contact HR.";
        }
      }
      related = faqHits.filter((f) => f.question !== f0?.question || !faqDirect).map((f) => f.question).slice(0, 3);
      if (!topic) topic = hits[0]?.policy_name ?? scans[0]?.meta.policy_name ?? "";
      contactCat = contactCategory(`${message} ${topic}`);
    }

    const isPosh = /posh|harass|inappropriate|sexual|misconduct|molest/i.test(`${topic} ${message}`);
    if (isPosh) contactCat = "posh";
    const contact = confidence === "high" ? null : await resolveContact(db, contactCat);

    // every source card carries the exact policy wording it comes from (up to 3 places in the policy)
    type Src = { meta: Hit; chunk_id: string; section: string | null; excerpt: string; cov: number };
    let srcs: Src[] = [];
    if (answer && confidence !== "low") {
      const pools = scans.length
        ? scans.flatMap((sc) => sc.chunks.map((c) => ({ meta: sc.meta, c })))
        : hits.map((h) => ({ meta: h, c: { id: h.chunk_id, section: h.section, content: h.content, score: h.score } }));
      srcs = pools.map(({ meta, c }) => ({ meta, c, r: extractAnswer(srcQuery, [c], { scan: true }) }))
        .filter((x) => x.r.answer && x.r.coverage >= 0.34)
        .sort((a, b) => (b.r.coverage + (b.c.id === used[0]?.chunk_id ? 1 : 0)) - (a.r.coverage + (a.c.id === used[0]?.chunk_id ? 1 : 0)))
        .slice(0, 3).map((x) => ({ meta: x.meta, chunk_id: x.c.id, section: x.c.section, excerpt: x.r.answer, cov: x.r.coverage }));
      if (!srcs.length && used[0]) srcs = [{ meta: used[0], chunk_id: used[0].chunk_id, section: used[0].section, excerpt: used[0].content.slice(0, 1200), cov: 0 }];
    }
    const sourcesOut = srcs.map((x) => ({
      chunk_id: x.chunk_id, policy_id: x.meta.policy_id, policy_name: x.meta.policy_name, category: x.meta.category,
      version: x.meta.version_label ?? `v${x.meta.version_number}`, effective_date: x.meta.effective_date, last_updated: x.meta.published_at,
      section: x.section, excerpt: x.excerpt,
    }));

    if (!regenerate) await db.from("chat_messages").insert({ session_id: sid, role: "user", content: message, department });
    const { data: saved } = await db.from("chat_messages").insert({
      session_id: sid, role: "assistant", confidence, topic,
      content: answer || "I couldn't find this information in the current Petpooja knowledge library.",
      sources: sourcesOut, related_questions: related, unanswered_parts: unanswered || null, contact, department,
    }).select("id,created_at").single();
    await db.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sid);

    // knowledge-gap logging (deduplicated semantically)
    if (confidence !== "high" && !regenerate) {
      const { data: dup } = await db.rpc("match_unanswered", { query_embedding: vec, threshold: 0.9 });
      const closest = hits.slice(0, 3).map((h) => ({ policy_name: h.policy_name, section: h.section, excerpt: h.content.slice(0, 400), score: Number(h.score.toFixed(3)) }));
      if (dup?.length) {
        const { data: u } = await db.from("unanswered_queries").select("ask_count").eq("id", dup[0].id).single();
        await db.from("unanswered_queries").update({ ask_count: (u?.ask_count ?? 1) + 1, last_asked_at: new Date().toISOString(), confidence }).eq("id", dup[0].id);
      } else {
        await db.from("unanswered_queries").insert({ question: message, topic, confidence, closest_content: closest, embedding: vec });
      }
    }

    return json({
      session_id: sid, message_id: saved?.id, created_at: saved?.created_at,
      answer, confidence, sources: sourcesOut, related_questions: related, unanswered_parts: unanswered, topic, contact, is_posh: isPosh,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Something went wrong" }, 500);
  }
});
