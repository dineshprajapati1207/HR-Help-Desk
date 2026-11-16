// Employee-side actions that need the service role but are safe and scoped (no admin writes).
import { corsHeaders, json, serviceClient } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = serviceClient();
    const { action, client_id, ...p } = await req.json();
    if (!client_id || typeof client_id !== "string") return json({ error: "client_id required" }, 400);

    switch (action) {
      case "list_sessions": {
        const { data } = await db.from("chat_sessions").select("id,title,updated_at").eq("client_id", client_id).order("updated_at", { ascending: false }).limit(50);
        return json({ sessions: data ?? [] });
      }
      case "get_session": {
        const { data: s } = await db.from("chat_sessions").select("id,client_id,title").eq("id", p.session_id).maybeSingle();
        if (!s || s.client_id !== client_id) return json({ error: "Not found" }, 404);
        const { data } = await db.from("chat_messages").select("id,role,content,confidence,sources,related_questions,unanswered_parts,contact,created_at").eq("session_id", s.id).order("created_at");
        return json({ session: { id: s.id, title: s.title }, messages: data ?? [] });
      }
      case "delete_session": {
        await db.from("chat_sessions").delete().eq("id", p.session_id).eq("client_id", client_id);
        return json({ ok: true });
      }
      case "delete_all_sessions": {
        await db.from("chat_sessions").delete().eq("client_id", client_id);
        return json({ ok: true });
      }
      case "recent_questions": {
        const { data: sessions } = await db.from("chat_sessions").select("id").eq("client_id", client_id).order("updated_at", { ascending: false }).limit(10);
        const ids = (sessions ?? []).map((s) => s.id);
        if (!ids.length) return json({ questions: [] });
        const { data } = await db.from("chat_messages").select("content,created_at").in("session_id", ids).eq("role", "user").order("created_at", { ascending: false }).limit(20);
        const seen = new Set<string>(); const out: string[] = [];
        for (const m of data ?? []) { const k = m.content.trim().toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(m.content); } if (out.length >= 6) break; }
        return json({ questions: out });
      }
      case "feedback": {
        const { data: m } = await db.from("chat_messages").select("id,session_id").eq("id", p.message_id).maybeSingle();
        if (!m) return json({ error: "Not found" }, 404);
        const { data: s } = await db.from("chat_sessions").select("client_id").eq("id", m.session_id).single();
        if (s?.client_id !== client_id) return json({ error: "Not found" }, 404);
        await db.from("query_feedback").delete().eq("message_id", m.id);
        await db.from("query_feedback").insert({ message_id: m.id, helpful: !!p.helpful, comment: p.comment?.slice(0, 1000) ?? null });
        return json({ ok: true });
      }
      case "log_calc": {
        const allowed = ["pl_gratuity", "income_tax", "pf"];
        if (!allowed.includes(p.calculator)) return json({ error: "bad calculator" }, 400);
        await db.from("calculation_history").insert({ calculator: p.calculator, client_id, department: p.department ?? null,
          rule_version_ref: p.rule_version_ref ?? null, inputs: p.inputs ?? null, outputs: p.outputs ?? null });
        return json({ ok: true });
      }
      case "faq_view": {
        const { data: f } = await db.from("faqs").select("view_count,status").eq("id", p.faq_id).maybeSingle();
        if (f?.status === "approved") await db.from("faqs").update({ view_count: (f.view_count ?? 0) + 1 }).eq("id", p.faq_id);
        return json({ ok: true });
      }
      case "policy_text":
      case "download_url":
        // The full policy document is not shown to or downloadable by employees. Answers come from the policy via Q&A and chat.
        return json({ error: "The full policy document is not available here. Please use the questions and answers, or ask the HR Assistant." }, 403);
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Something went wrong" }, 500);
  }
});
