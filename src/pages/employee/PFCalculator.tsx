import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Printer, RotateCcw, AlertTriangle } from "lucide-react";
import { Button, Card, Field, Input, PageHeader, Skeleton, Notice } from "@/components/ui";
import { ContactCard, Disclaimer } from "@/components/Shared";
import { employeeApi, view, type Contact } from "@/lib/api";
import { computePF, type PFRules } from "@/engines/pf";
import { inr, num, fmtDate } from "@/lib/format";
import { downloadReport } from "@/lib/pdf";
import { getDepartment } from "@/lib/client";

export default function PFCalculator() {
  const [rule, setRule] = useState<any | null | undefined>(undefined);
  const [contact, setContact] = useState<Contact | null>(null);
  const [disc, setDisc] = useState<string | null>(null);
  const [f, setF] = useState({ basic: "", da: "", ee: "", er: "", ceiling: "", vpf: "", month: new Date().toISOString().slice(0, 7) });
  const [res, setRes] = useState<ReturnType<typeof computePF> | null>(null);
  useEffect(() => {
    view<any>("public_pf_rules").then((r) => setRule(r[0] ?? null)).catch(() => setRule(null));
    view<Contact>("public_contacts").then((c) => setContact(c.find((x) => x.escalation_category === "pf") ?? c.find((x) => x.escalation_category === "payroll") ?? c.find((x) => x.is_default) ?? null)).catch(() => {});
    view<any>("public_calculator_rules", (q) => q.eq("calculator", "disclaimer_pf")).then((r) => setDisc(r[0]?.config?.text ?? null)).catch(() => {});
  }, []);
  useEffect(() => { if (rule) { const r = rule.rules as PFRules; setF((x) => ({ ...x, ee: String(r.employee_rate ?? ""), er: String(r.employer_rate ?? ""), ceiling: r.wage_ceiling ? String(r.wage_ceiling) : "" })); } }, [rule]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  if (rule === undefined) return <Skeleton className="h-96" />;
  if (!rule) return (
    <div><PageHeader title="PF Calculator" />
      <Notice>The PF calculator will be available once HR reviews and approves Petpooja's PF rules. For PF questions right now, please contact:</Notice>
      <div className="mt-4 max-w-md"><ContactCard contact={contact} topic="PF Query" /></div>
    </div>);
  const r = rule.rules as PFRules;
  const calculate = () => {
    if (!num(f.basic)) return toast.error("Enter your monthly basic salary.");
    const out = computePF({ basic: num(f.basic), da: num(f.da), employeeRate: num(f.ee), employerRate: num(f.er), ceiling: f.ceiling ? num(f.ceiling) : undefined, vpf: num(f.vpf) }, r);
    setRes(out);
    employeeApi("log_calc", { calculator: "pf", department: getDepartment(), rule_version_ref: `pf:v${rule.version}`, outputs: { monthly: out.monthly } }).catch(() => {});
  };
  const rows = (x: NonNullable<typeof res>): [string, string][] => [["PF wage (basic + eligible DA)", inr(x.wage)], [`Employee PF (${x.eeRate}%)`, inr(x.employee)], ["Voluntary PF", inr(x.vpf)], [`Employer contribution (${x.erRate}%)`, inr(x.employerTotal)], ["of which EPS (pension)", inr(x.eps)], ["of which EPF", inr(x.employerEpf)], ["Monthly PF", inr(x.monthly)], ["Annual PF", inr(x.annual)]];
  return (
    <div>
      <PageHeader title="PF Calculator" text="See how your monthly Provident Fund contribution is split between you and Petpooja." />
      {!rule.verified && <div className="mb-5"><Notice><AlertTriangle className="inline h-4 w-4 mr-1" />These PF rules have not been verified by HR yet. Treat results as indicative.</Notice></div>}
      <div className="grid lg:grid-cols-5 gap-6">
        <Card className="p-5 lg:col-span-2 h-fit space-y-4 no-print">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly basic (₹)"><Input inputMode="decimal" value={f.basic} onChange={set("basic")} /></Field>
            <Field label="Eligible DA (₹)"><Input inputMode="decimal" value={f.da} onChange={set("da")} placeholder="0" /></Field>
            <Field label="Employee PF %"><Input inputMode="decimal" value={f.ee} onChange={set("ee")} /></Field>
            <Field label="Employer PF %"><Input inputMode="decimal" value={f.er} onChange={set("er")} /></Field>
            <Field label="Wage ceiling (₹)"><Input inputMode="decimal" value={f.ceiling} onChange={set("ceiling")} placeholder="None" /></Field>
            <Field label="Voluntary PF %"><Input inputMode="decimal" value={f.vpf} onChange={set("vpf")} placeholder="0" disabled={r.voluntary_pf_allowed === false} /></Field>
          </div>
          <Field label="Calculation month"><Input type="month" value={f.month} onChange={set("month")} /></Field>
          <div className="flex gap-2"><Button className="flex-1" onClick={calculate}>Calculate</Button><Button variant="secondary" onClick={() => setRes(null)}><RotateCcw className="h-4 w-4" />Reset</Button></div>
          <p className="text-xs text-navy-3">Rule v{rule.version}{rule.effective_from ? `, effective ${fmtDate(rule.effective_from)}` : ""}{rule.source ? ` (source: ${rule.source})` : ""}</p>
        </Card>
        <div className="lg:col-span-3 space-y-4">
          {!res ? <Card className="p-8 text-center text-sm text-navy-3">Enter your basic salary and select Calculate.</Card> : (
            <Card className="p-5">
              <p className="text-3xl font-extrabold text-brand">{inr(res.monthly)}</p><p className="text-xs text-navy-3">Total monthly PF for {f.month}</p>
              <dl className="mt-4 text-sm space-y-1.5">{rows(res).map(([a, b]) => <div key={a} className="flex justify-between"><dt className="text-navy-3">{a}</dt><dd className="font-semibold">{b}</dd></div>)}</dl>
              <div className="mt-4 text-xs text-navy-3 space-y-1">
                <p>Employee: {inr(res.eeWage)} × {res.eeRate}% = {inr(res.employee)}</p>
                <p>Employer: {inr(res.erWage)} × {res.erRate}% = {inr(res.employerTotal)}{r.eps_rate ? `; EPS = min(${inr(res.employerTotal)}, ${inr(res.epsWage)} × ${r.eps_rate}%) = ${inr(res.eps)}` : ""}</p>
              </div>
              <div className="flex gap-2 mt-5 no-print">
                <Button variant="secondary" onClick={() => downloadReport("PF Estimate", [{ heading: `PF for ${f.month}`, rows: rows(res) }], [disc ?? ""].filter(Boolean), "pf-estimate.pdf")}><Download className="h-4 w-4" />Download PDF</Button>
                <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>
              </div>
            </Card>)}
          <Disclaimer text={disc} />
        </div>
      </div>
    </div>
  );
}
