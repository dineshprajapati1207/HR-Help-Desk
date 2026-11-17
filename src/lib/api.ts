import { supabase } from "./supabase";
import { clientId, getDepartment } from "./client";

export const adminPass = {
  get: () => { try { return sessionStorage.getItem("ph_admin_pass") ?? localStorage.getItem("ph_admin_pass") ?? ""; } catch { return ""; } },
  set: (v: string, keep: boolean) => { try { sessionStorage.setItem("ph_admin_pass", v); if (keep) localStorage.setItem("ph_admin_pass", v); } catch { /* ignore */ } },
  clear: () => { try { sessionStorage.removeItem("ph_admin_pass"); localStorage.removeItem("ph_admin_pass"); } catch { /* ignore */ } },
};

async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = {};
  if (fn === "admin" && adminPass.get()) headers["x-admin-passcode"] = adminPass.get();
  const { data, error } = await supabase.functions.invoke(fn, { body, headers });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as any).context as Response | undefined;
      if (ctx?.json) { const j = await ctx.json(); msg = j.error ?? msg; if (j.code) throw Object.assign(new Error(msg), { code: j.code }); }
    } catch (e) { if ((e as any).code) throw e; }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const employeeApi = <T = any>(action: string, payload: Record<string, unknown> = {}) =>
  call<T>("public", { action, client_id: clientId(), ...payload });

export const adminApi = <T = any>(action: string, payload: Record<string, unknown> = {}) =>
  call<T>("admin", { action, ...payload });

export type Source = { chunk_id: string; policy_id: string; policy_name: string; category: string; version: string; effective_date: string | null; last_updated: string | null; section: string | null; excerpt: string; kind?: "qa" | "policy" };
export type Contact = { id: string; name: string; phone: string | null; email: string | null; department: string | null; escalation_category: string; availability: string | null; is_default?: boolean };
export type ChatReply = { session_id: string; message_id: string; answer: string; confidence: "high" | "medium" | "low"; sources: Source[]; related_questions: string[]; unanswered_parts: string; topic: string; contact: Contact | null; is_posh: boolean };

export const askAI = (message: string, session_id: string | null, opts: { policy_id?: string | null; regenerate?: boolean } = {}) =>
  call<ChatReply>("chat", { message, session_id, client_id: clientId(), department: getDepartment(), ...opts });

export const draftEmail = (payload: Record<string, unknown>) => call<{ subject: string; body: string; scenario: string }>("draft-email", { ...payload, client_id: clientId() });

export async function view<T = any>(name: string, build?: (q: any) => any): Promise<T[]> {
  let q: any = supabase.from(name).select("*");
  if (build) q = build(q);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}
