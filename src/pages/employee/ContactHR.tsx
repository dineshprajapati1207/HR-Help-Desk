import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Copy, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { Button, Card, Field, Input, Select, Textarea, Badge } from "@/components/ui";
import { draftEmail, view, type Contact } from "@/lib/api";
import { getDepartment } from "@/lib/client";
import { configured } from "@/lib/supabase";
import { policyContact, type ContactPerson } from "@/lib/policyContacts";

const HR: ContactPerson = { name: "Mr. Apurv Christian", email: "hr@petpooja.com", mobile: "6358929782" };

type Form = { name: string; employee_id: string; department: string; policy: string; subject: string; concern: string; details: string };

const firstName = (n: string) => n.replace(/^(mr|ms|mrs)\.?\s+/i, "").split(/\s+/)[0];
const greetingFor = (people: ContactPerson[]) => `Dear ${people.map((p) => firstName(p.name)).join(" and ")},`;

/** Plain, professional email built from what the employee typed. Used when the drafting service is unavailable. */
function localDraft(f: Form, greeting: string) {
  const subject = f.subject.trim() || `${f.policy && f.policy !== "General / Other" ? f.policy : "HR"} query from ${f.name} (${f.employee_id})`;
  const body = [
    greeting,
    "",
    `I hope you are doing well. I am ${f.name} (Employee ID: ${f.employee_id})${f.department ? ` from the ${f.department} department` : ""}.${f.policy ? ` I am writing regarding the ${f.policy}.` : ""}`,
    "",
    f.concern.trim(),
    ...(f.details.trim() ? ["", `Relevant details: ${f.details.trim()}`] : []),
    "",
    "I would be grateful if you could look into this and guide me at your earliest convenience.",
    "",
    "Thank you for your time and support.",
    "",
    "Regards,",
    f.name,
    `Employee ID: ${f.employee_id}`,
    ...(f.department ? [`Department: ${f.department}`] : []),
  ].join("\n");
  return { subject, body };
}

export default function ContactHR() {
  const [params] = useSearchParams();
  const [defaultContact, setDefaultContact] = useState<ContactPerson>(HR);
  const [policies, setPolicies] = useState<string[]>([]);
  const [f, setF] = useState<Form>({ name: "", employee_id: "", department: getDepartment() ?? "", policy: params.get("topic") ?? "", subject: "", concern: "", details: "" });
  const [out, setOut] = useState<{ subject: string; body: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    if (!configured) return;
    view<Contact>("public_contacts").then((c) => {
      const d = c.find((x) => x.is_default) ?? c.find((x) => x.escalation_category === "general_hr");
      if (d) setDefaultContact({ name: d.name.startsWith("Mr") ? d.name : `Mr. ${d.name}`, email: d.email || HR.email, mobile: d.phone || HR.mobile });
    }).catch(() => {});
    view("public_policies", (q) => q.order("name")).then((p) => setPolicies(p.map((x: any) => x.name))).catch(() => {});
  }, []);

  // who to contact depends on the selected policy; every other policy uses the default HR contact
  const special = policyContact(f.policy);
  const people: ContactPerson[] = special?.people ?? [defaultContact];
  const noEmail = !!special?.message; // e.g. POSH: no named person, only a message
  const recipients = noEmail ? defaultContact.email : people.map((p) => p.email).join(", ");

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value });
    if (k === "policy") setOut(null); // the draft is addressed to the contact of the selected policy
  };

  async function create(regenerate = false) {
    const need: string[] = [];
    if (!f.name.trim()) need.push("your name");
    if (!f.employee_id.trim()) need.push("your employee ID");
    if (f.concern.trim().length < 10) need.push("your question or concern (a sentence or two)");
    setMissing(need);
    if (need.length) return;
    setBusy(true);
    const greeting = special?.people ? greetingFor(people) : "Dear HR Team,";
    try {
      const r = await draftEmail({ name: f.name, employee_id: f.employee_id, department: f.department, topic: f.policy, subject: f.subject, concern: f.concern, details: f.details, tone: "Professional", regenerate });
      setOut({ subject: r.subject, body: r.body.replace(/^Dear[^\n]*,/, greeting), to: recipients });
    } catch {
      setOut({ ...localDraft(f, greeting), to: recipients }); // drafting service not reachable: still give the employee a ready email
    } finally { setBusy(false); }
  }
  const copy = (t: string, l: string) => { navigator.clipboard.writeText(t); toast.success(`${l} copied`); };
  const mailto = out ? `mailto:${out.to.replace(/\s/g, "")}?subject=${encodeURIComponent(out.subject)}&body=${encodeURIComponent(out.body)}` : "#";

  return (
    <div className="max-w-[760px] space-y-5">
      <h1 className="text-xl font-extrabold">Contact HR</h1>
      <Card className="p-4 text-sm space-y-3">
        {special?.message ? <p className="font-semibold">{special.message}</p> : people.map((p, i) => (
          <div key={i} className={i > 0 ? "pt-3 border-t border-slate-100 space-y-1" : "space-y-1"}>
            <p><b>Contact Person:</b> {p.name}</p>
            <p><b>Email:</b> <a className="text-sky-700 underline" href={`mailto:${p.email}`}>{p.email}</a></p>
            <p><b>Mobile:</b> <a className="text-sky-700 underline" href={`tel:${p.mobile}`}>{p.mobile}</a></p>
          </div>
        ))}
      </Card>

      <h2 className="font-bold">Draft an Email to HR</h2>
      <Card className="p-4 space-y-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <Field label="Employee name"><Input value={f.name} onChange={set("name")} /></Field>
          <Field label="Employee ID"><Input value={f.employee_id} onChange={set("employee_id")} /></Field>
          <Field label="Department"><Input value={f.department} onChange={set("department")} /></Field>
          <Field label="Policy name">
            <Select value={f.policy} onChange={set("policy")}><option value="">Select...</option>{policies.map((p) => <option key={p}>{p}</option>)}<option>General / Other</option>{f.policy && !policies.includes(f.policy) && f.policy !== "General / Other" && <option>{f.policy}</option>}</Select>
          </Field>
        </div>
        <div className="sm:w-1/2"><Field label="Subject"><Input value={f.subject} onChange={set("subject")} placeholder="Optional. We will write one if left blank" /></Field></div>
        <Field label="Your question or concern"><Textarea value={f.concern} onChange={set("concern")} className="min-h-[90px]" /></Field>
        <Field label="Relevant details / supporting information (dates, amounts, what you already tried)"><Textarea value={f.details} onChange={set("details")} className="min-h-[90px]" /></Field>
        {missing.length > 0 && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">Please add {missing.join(", ")} so HR can help you faster.</p>}
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="lg" loading={busy} onClick={() => create()}><Sparkles className="h-4 w-4" />Create email draft</Button>
          <span className="text-sm text-navy-3">Nothing is sent until you send it yourself.</span>
        </div>
      </Card>

      {out && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap"><Badge tone="orange">Draft, not sent</Badge><span className="text-sm text-navy-3">To: <b>{out.to}</b></span></div>
          <Field label="Subject"><Input value={out.subject} onChange={(e) => setOut({ ...out, subject: e.target.value })} /></Field>
          <Field label="Email (you can edit it)"><Textarea className="min-h-[300px] leading-relaxed" value={out.body} onChange={(e) => setOut({ ...out, body: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => copy(`To: ${out.to}\nSubject: ${out.subject}\n\n${out.body}`, "Email")}><Copy className="h-4 w-4" />Copy email</Button>
            <a href={mailto}><Button><ExternalLink className="h-4 w-4" />Open in my email app</Button></a>
            <Button variant="ghost" loading={busy} onClick={() => create(true)}><RefreshCw className="h-4 w-4" />Rewrite</Button>
          </div>
          <p className="text-xs text-navy-3">Review the draft, then press send in your own email app. PeopleHub never sends emails for you.</p>
        </Card>
      )}
    </div>
  );
}
