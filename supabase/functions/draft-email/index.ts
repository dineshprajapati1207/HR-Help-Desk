import { corsHeaders, json, serviceClient } from "../_shared/common.ts";

const SCENARIOS: [RegExp, string][] = [
  [/leave|absence|vacation/i, "Leave Request"], [/salary|payslip|payroll|pay\b/i, "Salary Query"], [/attendance|punch|swipe|biometric/i, "Attendance Correction"],
  [/loan|advance/i, "Loan Request"], [/relocat|transfer/i, "Relocation Request"], [/letter|certificate|document|experience/i, "Document Request"],
  [/\bpf\b|provident|uan/i, "PF Query"], [/tax|tds|form 16|80c/i, "Income Tax Query"], [/gratuity/i, "Gratuity Query"],
];

// Builds the email from exactly what the employee typed. Nothing is added or assumed.
function build(b: Record<string, string>) {
  const tone = b.tone || "Professional";
  const name = (b.name ?? "").trim(), id = (b.employee_id ?? "").trim(), dept = (b.department ?? "").trim();
  const topic = (b.topic ?? "").trim() && b.topic !== "General / Other" ? b.topic.trim() : "";
  const scenario = SCENARIOS.find(([r]) => r.test(`${topic} ${b.concern} ${b.subject ?? ""}`))?.[1] ?? "General HR Concern";
  const subject = (b.subject ?? "").trim() || `${topic || scenario}${name ? ` - ${name}` : ""}${id ? ` (${id})` : ""}`;
  const polite = tone === "Polite", formal = tone === "Formal", short = tone === "Short and Simple";
  const lines: string[] = ["Dear HR Team,", ""];
  if (!short) lines.push(polite ? "I hope you are doing well." : formal ? "I am writing to bring the following matter to your attention." : "I hope this email finds you well.", "");
  lines.push(`${name ? `I am ${name}${id ? ` (Employee ID: ${id})` : ""}${dept ? ` from the ${dept} department` : ""}.` : ""}${topic ? ` This is regarding the ${topic}.` : ""}`.trim(), "");
  lines.push(String(b.concern).trim());
  const extra = [b.details, b.dates_amounts].map((x) => (x ?? "").trim()).filter(Boolean).join("\n");
  if (extra) lines.push("", short ? extra : `Relevant details:\n${extra}`);
  lines.push("", polite ? "I would be very grateful for your guidance and support in this matter." : formal ? "I request you to kindly look into the matter and advise me accordingly." : "Please let me know how I should proceed.", "", polite ? "Thank you so much for your time." : "Thank you.", "", "Regards,");
  if (name) lines.push(name);
  if (id) lines.push(`Employee ID: ${id}`);
  if (dept) lines.push(`Department: ${dept}`);
  return { subject, body: lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").replace(/\n{3,}/g, "\n\n"), scenario };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const b = await req.json();
    if (!b.concern || String(b.concern).trim().length < 5) return json({ error: "Describe your question or concern first." }, 400);
    const r = build(b);
    const db = serviceClient();
    await db.from("email_drafts").insert({ client_id: b.client_id ?? null, scenario: r.scenario, inputs: { ...b, name: undefined, employee_id: undefined }, subject: r.subject, body: r.body });
    return json(r);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Something went wrong" }, 500);
  }
});
