import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Copy, RefreshCw, Sparkles, Mail } from "lucide-react";
import { Button, Card, Field, Input, PageHeader, Select, Textarea, Badge } from "@/components/ui";
import { draftEmail } from "@/lib/api";
import { getDepartment } from "@/lib/client";

const TONES = ["Professional", "Polite", "Short and Simple", "Formal"];
const TOPICS = ["Leave Request", "Salary Query", "Attendance Correction", "Loan Request", "Relocation Request", "Document Request", "PF Query", "Income Tax Query", "Gratuity Query", "General HR Concern"];

export default function DraftEmail() {
  const [params] = useSearchParams();
  const [f, setF] = useState({ name: "", employee_id: "", department: getDepartment() ?? "", topic: params.get("topic") ?? "", subject: "", concern: "", details: "", dates_amounts: "", tone: "Professional" });
  const [out, setOut] = useState<{ subject: string; body: string; scenario: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const generate = async (regenerate = false) => {
    if (f.concern.trim().length < 5) return toast.error("Describe your question or concern first.");
    setBusy(true);
    try { setOut(await draftEmail({ ...f, regenerate })); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const copy = (t: string, l: string) => { navigator.clipboard.writeText(t); toast.success(`${l} copied`); };
  return (
    <div>
      <PageHeader title="Draft an Email to HR" text="Explain your request in your own words. PeopleHub writes a clear, professional email you can edit and send yourself. Nothing is sent automatically." />
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5 space-y-4 h-fit">
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Employee name"><Input value={f.name} onChange={set("name")} /></Field>
            <Field label="Employee ID"><Input value={f.employee_id} onChange={set("employee_id")} /></Field>
            <Field label="Department"><Input value={f.department} onChange={set("department")} /></Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Policy name / topic"><Input list="topics" value={f.topic} onChange={set("topic")} placeholder="e.g. Leave Request" /><datalist id="topics">{TOPICS.map((t) => <option key={t} value={t} />)}</datalist></Field>
            <Field label="Subject (optional)"><Input value={f.subject} onChange={set("subject")} placeholder="Generated if left blank" /></Field>
          </div>
          <Field label="Your question or concern"><Textarea value={f.concern} onChange={set("concern")} placeholder="I want to apply for leave because I have personal work from 20 November to 22 November." /></Field>
          <Field label="Relevant details / supporting information"><Textarea className="min-h-[70px]" value={f.details} onChange={set("details")} /></Field>
          <Field label="Dates and amounts (optional)"><Input value={f.dates_amounts} onChange={set("dates_amounts")} /></Field>
          <Field label="Preferred tone"><Select value={f.tone} onChange={set("tone")}>{TONES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Button className="w-full" size="lg" loading={busy} onClick={() => generate()}><Sparkles className="h-4 w-4" />Generate email</Button>
        </Card>
        <div>
          {!out ? <Card className="p-10 text-center"><Mail className="h-8 w-8 text-brand mx-auto" /><p className="font-bold mt-3">Your draft appears here</p><p className="text-sm text-navy-3 mt-1">You can edit the subject and body before copying.</p></Card> : (
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2"><Badge tone="orange">{out.scenario}</Badge><Badge>Draft, not sent</Badge></div>
              <Field label="Subject"><Input value={out.subject} onChange={(e) => setOut({ ...out, subject: e.target.value })} /></Field>
              <Field label="Email"><Textarea className="min-h-[320px] leading-relaxed" value={out.body} onChange={(e) => setOut({ ...out, body: e.target.value })} /></Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => copy(out.subject, "Subject")}><Copy className="h-4 w-4" />Copy subject</Button>
                <Button variant="secondary" onClick={() => copy(out.body, "Email")}><Copy className="h-4 w-4" />Copy email</Button>
                <Button onClick={() => copy(`Subject: ${out.subject}\n\n${out.body}`, "Full email")}><Copy className="h-4 w-4" />Copy full email</Button>
                <Button variant="ghost" loading={busy} onClick={() => generate(true)}><RefreshCw className="h-4 w-4" />Regenerate</Button>
              </div>
            </Card>)}
        </div>
      </div>
    </div>
  );
}
