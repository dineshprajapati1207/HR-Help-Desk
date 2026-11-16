import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-passcode",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return (req.headers.get("cf-connecting-ip") ?? xff.split(",")[0] ?? "").trim();
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Admin protection (server-side, employees can never pass it):
 *  1. ADMIN_PASSCODE secret set  -> the request must carry the correct x-admin-passcode header (admin login screen).
 *     If ADMIN_ALLOWED_IPS is also a real list (not "*"), the IP must match too.
 *  2. No passcode set -> falls back to ADMIN_ALLOWED_IPS (office / VPN IPs) or an internal proxy token. */
export function isTrustedAdmin(req: Request): { ok: boolean; reason?: string; code?: string; actor: string } {
  const ip = clientIp(req);
  const allowed = (Deno.env.get("ADMIN_ALLOWED_IPS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const proxyToken = Deno.env.get("ADMIN_PROXY_TOKEN");
  const headerToken = req.headers.get("x-admin-proxy-token");
  const passcode = Deno.env.get("ADMIN_PASSCODE");
  const ipOk = (passcode && allowed.includes("*")) || allowed.some((a) => a !== "*" && (ip === a || (a.endsWith(".") && ip.startsWith(a)))); // "*" only counts when a passcode is also set
  const ipRestricted = allowed.some((a) => a !== "*");
  if (proxyToken && headerToken && safeEqual(headerToken, proxyToken)) return { ok: true, actor: `proxy:${ip}` };
  if (passcode) {
    const given = req.headers.get("x-admin-passcode") ?? "";
    if (!given) return { ok: false, actor: ip, code: "ADMIN_PASSCODE_REQUIRED", reason: "Enter the admin passcode to continue." };
    if (!safeEqual(given, passcode)) return { ok: false, actor: ip, code: "ADMIN_PASSCODE_INVALID", reason: "Incorrect admin passcode." };
    if (ipRestricted && !ipOk) return { ok: false, actor: ip, reason: `This network (${ip || "unknown"}) is not on the admin allow-list.` };
    return { ok: true, actor: `admin:${ip}` };
  }
  if (ipOk) return { ok: true, actor: `ip:${ip}` };
  return {
    ok: false,
    actor: ip,
    reason: allowed.some((a) => a !== "*")
      ? `This network (${ip || "unknown"}) is not on the admin allow-list.`
      : "Admin access is locked. Set ADMIN_PASSCODE on the Edge Functions to enable it.",
  };
}

export async function audit(db: SupabaseClient, action: string, entity: string, entityId: string | null, details: unknown, actor: string) {
  await db.from("audit_logs").insert({ action, entity, entity_id: entityId, details, actor });
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

export const POLICY_CATEGORIES = [
  "Attendance", "Leave", "Payroll", "Employee Benefits", "Recruitment", "Employee Development",
  "Relocation", "Separation", "POSH", "Loans", "Salary Advance", "Referral", "Other Policies",
];

export const CONTACT_CATEGORIES = ["general_hr", "payroll", "income_tax", "pf", "loans", "posh", "other"];

export async function resolveContact(db: SupabaseClient, category: string | null) {
  const { data } = await db.from("contact_directory").select("id,name,phone,email,department,escalation_category,availability,is_default").eq("is_active", true);
  const list = data ?? [];
  return list.find((c) => c.escalation_category === category) ?? list.find((c) => c.is_default) ?? list.find((c) => c.escalation_category === "general_hr") ?? null;
}
